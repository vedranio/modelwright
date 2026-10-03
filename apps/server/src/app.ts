import { Hono, type Context } from 'hono';
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
import { DEFAULT_ALLOWED_HOSTS, DEFAULT_ALLOWED_ORIGINS } from './config';
import { readTextOrNull, writeAtomic } from './fsio';
import { originGuard } from './guard';
import { HttpError, designDirState, designFile, resolveProjectDir } from './paths';
import { initialise, isInitialised, summarise } from './projects';
import { Recents } from './recents';

export interface AppOptions {
  /** modelwright's own state directory (recents). */
  homeDir: string;
  allowedHosts?: readonly string[];
  allowedOrigins?: readonly string[];
}

const PathBody = z.object({ path: z.string() });
const InitBody = z.object({ path: z.string(), name: z.string().optional() });

export function createApp({
  homeDir,
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
}: AppOptions) {
  const recents = new Recents(homeDir);
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
    const summary = await summarise(dir);
    await recents.add({ path: summary.path, name: summary.name });
    return c.json(summary);
  });

  app.post('/projects/init', async (c) => {
    const body = await readBody(c, InitBody);
    const dir = await resolveProjectDir(body.path);
    await initialise(dir, body.name);
    const summary = await summarise(dir);
    await recents.add({ path: summary.path, name: summary.name });
    return c.json(summary, 201);
  });

  app.get('/projects/recent', async (c) => {
    const list = await recents.list();
    const summaries: ProjectSummary[] = await Promise.all(
      list.map(async (entry) => ({ ...entry, initialised: await isInitialised(entry.path) })),
    );
    return c.json(summaries);
  });

  app.delete('/projects/recent', async (c) => {
    const body = await readBody(c, PathBody);
    await recents.remove(body.path);
    return c.body(null, 204);
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
    await writeAtomic(designFile(dir, kind), stringifyDesign(kind, result.doc));
    if (kind === 'config') {
      // Keep the picker in step with the header's inline rename.
      await recents.rename(dir, (result.doc as Config).name);
    }
    return c.body(null, 204);
  });

  return app;
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
