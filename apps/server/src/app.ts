import { Hono, type Context } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import type { z } from 'zod';
import {
  CoreError,
  CreateArgs,
  DesignKindArg,
  DesignWatcher,
  InitArgs,
  PathArgs,
  PREVIEW_TIMEOUT_MS,
  PreviewArgs,
  STATUS_FOR_CODE,
  createCore,
} from '@modelwright/core';
import type { DesignKind } from '@modelwright/schema';
import { DEFAULT_ALLOWED_HOSTS, DEFAULT_ALLOWED_ORIGINS, SERVER_PORT, WEB_PORT } from './config';
import { originGuard } from './guard';

export interface AppOptions {
  /** modelwright's own state directory (recents). */
  homeDir: string;
  /** The user's home directory, shown as `~` in display paths. */
  userHome?: string;
  /** Clock for recents timestamps. */
  now?: () => Date;
  allowedHosts?: readonly string[];
  allowedOrigins?: readonly string[];
  /** modelwright's own ports, which a preview URL may not use on a loopback host. */
  toolPorts?: readonly number[];
  /** How long a preview check waits for a response. */
  previewTimeoutMs?: number;
  /** Watches open projects' design files for changes made outside modelwright. */
  watcher?: DesignWatcher;
  /** How often an idle event stream sends a comment, so proxies keep it open. */
  heartbeatMs?: number;
  /** The demo project's template, offered once per install; none (tests) offers no demo. */
  demoTemplate?: string;
}

/** The web app's origin when a request doesn't say (curl, tests). */
const DEFAULT_TOOL_ORIGIN = `http://localhost:${WEB_PORT}`;

/** A failure of the HTTP layer itself (the request body), before the core is called. */
class HttpError extends Error {
  constructor(
    readonly status: 400 | 415,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The HTTP transport over the core: routes, the origin/host guard and server-sent events. It
 * maps requests onto core calls and `CoreError`s onto status codes, and holds no project logic.
 */
export function createApp({
  homeDir,
  userHome,
  now,
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  toolPorts = [WEB_PORT, SERVER_PORT],
  previewTimeoutMs = PREVIEW_TIMEOUT_MS,
  watcher,
  heartbeatMs = 25_000,
  demoTemplate,
}: AppOptions) {
  const core = createCore({
    homeDir,
    ...(userHome !== undefined && { userHome }),
    ...(now !== undefined && { now }),
    ...(watcher !== undefined && { watcher }),
    ...(demoTemplate !== undefined && { demoTemplate }),
    toolPorts,
    previewTimeoutMs,
  });
  const app = new Hono().basePath('/api');

  app.use('*', originGuard({ allowedHosts, allowedOrigins }));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ message: err.message }, err.status);
    if (err instanceof CoreError) {
      if (err.design) return c.json(err.design, 422);
      return c.json({ message: err.message }, STATUS_FOR_CODE[err.code]);
    }
    console.error(err);
    return c.json({ message: err.message || 'Internal error' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/projects/open', async (c) => {
    const body = await readBody(c, PathArgs);
    return c.json(await core.openProject(body.path));
  });

  app.post('/projects/init', async (c) => {
    const body = await readBody(c, InitArgs);
    return c.json(await core.initProject(body.path, body.name), 201);
  });

  app.post('/projects/create', async (c) => {
    const body = await readBody(c, CreateArgs);
    return c.json(await core.createProject(body.parent, body.name, body.git ?? false), 201);
  });

  app.get('/projects/recent', async (c) => c.json(await core.listRecent()));

  app.delete('/projects/recent', async (c) => {
    const body = await readBody(c, PathArgs);
    await core.removeRecent(body.path);
    return c.body(null, 204);
  });

  // Server-sent events: `change` with `{ "kind": "erd" }` whenever a design file (or `build.json`,
  // as `"build"`) changes outside modelwright. Behind the same guard as everything else.
  app.get('/design/events', async (c) => {
    let stream: SSEStreamingApi | undefined;
    const unsubscribe = await core.watchDesign(c.req.query('path') ?? '', (kind) => {
      void stream?.writeSSE({ event: 'change', data: JSON.stringify({ kind }) });
    });
    return streamSSE(
      c,
      async (s) => {
        stream = s;
        const heartbeat = setInterval(() => void s.write(': keep-alive\n\n'), heartbeatMs);
        await s.writeSSE({ event: 'ready', data: '' });
        await new Promise<void>((resolve) => s.onAbort(resolve));
        clearInterval(heartbeat);
        unsubscribe();
      },
      async () => unsubscribe(),
    );
  });

  // Registered before `/design/:file`, which would otherwise take "build" as a file kind.
  app.get('/design/build', async (c) => {
    return c.json(await core.readBuildRecord(c.req.query('path') ?? ''));
  });

  app.get('/design/:file', async (c) => {
    const kind = designKind(c.req.param('file'));
    return c.json(await core.readDesign(c.req.query('path') ?? '', kind));
  });

  app.put('/design/:file', async (c) => {
    const kind = designKind(c.req.param('file'));
    // The folder is checked before the body is read, so a missing project is a 404 whatever the body.
    const path = await core.resolveProjectDir(c.req.query('path'));
    await core.writeDesign(path, kind, await readJson(c));
    return c.body(null, 204);
  });

  app.post('/preview/check', async (c) => {
    const body = await readBody(c, PreviewArgs);
    const toolOrigin = c.req.header('origin') ?? DEFAULT_TOOL_ORIGIN;
    return c.json(await core.checkPreview(body.url, { toolOrigin }));
  });

  return app;
}

function designKind(raw: string): DesignKind {
  const result = DesignKindArg.safeParse(raw);
  if (!result.success) {
    throw new HttpError(400, `Unknown design file "${raw}"; expected erd, flows or config`);
  }
  return result.data;
}

async function readJson(c: Context): Promise<unknown> {
  if (!c.req.header('content-type')?.includes('application/json')) {
    throw new HttpError(415, 'Request body must be JSON');
  }
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

async function readBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const result = schema.safeParse(await readJson(c));
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join('.')}` : '';
    throw new HttpError(400, `Invalid request body${where}: ${first?.message ?? 'unknown'}`);
  }
  return result.data;
}
