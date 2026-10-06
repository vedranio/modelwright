import os from 'node:os';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  isDesignKind,
  parseDesign,
  parseDesignJson,
  stringifyDesign,
  type Config,
  type DesignKind,
  type ProjectSummary,
} from '@modelwright/schema';
import { DEFAULT_ALLOWED_HOSTS, DEFAULT_ALLOWED_ORIGINS, SERVER_PORT, WEB_PORT } from './config';
import {
  readBuildRecord,
  readTextOrNull,
  regenerateSpec,
  writeAtomic,
} from '@modelwright/project/node';
import { originGuard } from './guard';
import { checkPreview, PREVIEW_TIMEOUT_MS } from './previewCheck';
import { HttpError, designDirState, designFile, resolveProjectDir, tildify } from './paths';
import { initialise, isInitialised, summarise } from './projects';
import { Recents } from './recents';
import { DesignWatcher } from './watcher';

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
}

/** The web app's origin when a request doesn't say (curl, tests). */
const DEFAULT_TOOL_ORIGIN = `http://localhost:${WEB_PORT}`;

const PathBody = z.object({ path: z.string() });
const InitBody = z.object({ path: z.string(), name: z.string().optional() });
const PreviewBody = z.object({ url: z.string() });

export function createApp({
  homeDir,
  userHome = os.homedir(),
  now,
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  toolPorts = [WEB_PORT, SERVER_PORT],
  previewTimeoutMs = PREVIEW_TIMEOUT_MS,
  watcher = new DesignWatcher(),
  heartbeatMs = 25_000,
}: AppOptions) {
  const recents = new Recents(homeDir, now);
  const app = new Hono().basePath('/api');

  app.use('*', originGuard({ allowedHosts, allowedOrigins }));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ message: err.message }, err.status);
    console.error(err);
    return c.json({ message: err.message || 'Internal error' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/projects/open', async (c) => {
    const body = await readBody(c, PathBody);
    const dir = await resolveProjectDir(body.path);
    const summary = await summarise(dir, userHome);
    const { lastOpenedAt } = await recents.add({ path: summary.path, name: summary.name });
    return c.json({ ...summary, lastOpenedAt });
  });

  app.post('/projects/init', async (c) => {
    const body = await readBody(c, InitBody);
    const dir = await resolveProjectDir(body.path);
    await initialise(dir, body.name, (kind, text) => watcher.noteWrite(dir, kind, text));
    await refreshSpec(dir);
    const summary = await summarise(dir, userHome);
    const { lastOpenedAt } = await recents.add({ path: summary.path, name: summary.name });
    return c.json({ ...summary, lastOpenedAt }, 201);
  });

  app.get('/projects/recent', async (c) => {
    const list = await recents.list();
    const summaries: ProjectSummary[] = await Promise.all(
      list.map(async (entry) => ({
        path: entry.path,
        displayPath: tildify(entry.path, userHome),
        name: entry.name,
        initialised: await isInitialised(entry.path),
        ...(entry.lastOpenedAt !== undefined && { lastOpenedAt: entry.lastOpenedAt }),
      })),
    );
    return c.json(summaries);
  });

  app.delete('/projects/recent', async (c) => {
    const body = await readBody(c, PathBody);
    await recents.remove(body.path);
    return c.body(null, 204);
  });

  // Server-sent events: `change` with `{ "kind": "erd" }` whenever a design file (or `build.json`,
  // as `"build"`) changes outside modelwright. Behind the same guard as everything else.
  app.get('/design/events', async (c) => {
    const dir = await resolveProjectDir(c.req.query('path'));
    if ((await designDirState(dir)) !== 'dir') {
      throw new HttpError(409, `modelwright is not initialised in ${dir}`);
    }
    return streamSSE(c, async (stream) => {
      const unsubscribe = await watcher.subscribe(dir, (kind) => {
        void stream.writeSSE({ event: 'change', data: JSON.stringify({ kind }) });
      });
      const heartbeat = setInterval(() => void stream.write(': keep-alive\n\n'), heartbeatMs);
      await stream.writeSSE({ event: 'ready', data: '' });
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // The build record, read-only: the CLI writes it after a verified build, never the server.
  // Registered before `/design/:file`, which would otherwise take "build" as a file kind.
  app.get('/design/build', async (c) => {
    const dir = await resolveProjectDir(c.req.query('path'));
    return c.json(await readBuildRecord(dir));
  });

  app.get('/design/:file', async (c) => {
    const kind = designKind(c.req.param('file'));
    const dir = await resolveProjectDir(c.req.query('path'));
    const text = await readTextOrNull(designFile(dir, kind));
    if (text === null) throw new HttpError(404, `.design/${kind}.json not found in ${dir}`);

    const result = parseDesignJson(kind, text);
    if (!result.ok) return c.json(result.error, 422);
    return c.json(result.doc);
  });

  app.put('/design/:file', async (c) => {
    const kind = designKind(c.req.param('file'));
    const dir = await resolveProjectDir(c.req.query('path'));
    const data = await readJson(c);

    const result = parseDesign(kind, data);
    if (!result.ok) return c.json(result.error, 422);

    if ((await designDirState(dir)) !== 'dir') {
      throw new HttpError(409, `modelwright is not initialised in ${dir}`);
    }
    const text = stringifyDesign(kind, result.doc);
    watcher.noteWrite(dir, kind, text);
    await writeAtomic(designFile(dir, kind), text);
    await refreshSpec(dir);
    if (kind === 'config') {
      // Keep the picker in step with the header's inline rename.
      await recents.rename(dir, (result.doc as Config).name);
    }
    return c.body(null, 204);
  });

  // Classifies a preview URL for the UI view. Reads no files; returns no response bodies.
  app.post('/preview/check', async (c) => {
    const body = await readBody(c, PreviewBody);
    const toolOrigin = c.req.header('origin') ?? DEFAULT_TOOL_ORIGIN;
    return c.json(
      await checkPreview(body.url, { toolOrigin, toolPorts, timeoutMs: previewTimeoutMs }),
    );
  });

  return app;
}

/**
 * Regenerates `.design/spec.md` after a successful write. The design file is already saved, so
 * a failure here is logged rather than failing the request.
 */
async function refreshSpec(dir: string): Promise<void> {
  try {
    await regenerateSpec(dir);
  } catch (err) {
    console.error(`Couldn't write ${dir}/.design/spec.md`, err);
  }
}

function designKind(raw: string): DesignKind {
  if (!isDesignKind(raw)) {
    throw new HttpError(400, `Unknown design file "${raw}"; expected erd, flows or config`);
  }
  return raw;
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
