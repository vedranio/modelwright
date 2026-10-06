import fs from 'node:fs/promises';
import path from 'node:path';
import { isNotFound } from '@modelwright/project/node';

/** A failure that maps directly onto an HTTP response. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 415,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Validates a project path from a request: it must be an absolute path to an existing directory.
 * Returns it normalised, so `..` segments are resolved before anything else uses it.
 */
export async function resolveProjectDir(raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new HttpError(400, 'A project path is required');
  }
  if (!path.isAbsolute(raw)) {
    throw new HttpError(400, `Project path must be absolute: ${raw}`);
  }
  const dir = path.resolve(raw);
  const stat = await statOrNull(dir);
  if (!stat) throw new HttpError(404, `No folder at ${dir}`);
  if (!stat.isDirectory()) throw new HttpError(400, `Not a folder: ${dir}`);
  return dir;
}

/** `path` with `home` replaced by `~`, for display. Paths outside home are returned unchanged. */
export function tildify(p: string, home: string): string {
  const base = path.resolve(home);
  if (p === base) return '~';
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  return p.startsWith(prefix) ? `~${path.sep}${p.slice(prefix.length)}` : p;
}

export async function statOrNull(p: string) {
  try {
    return await fs.stat(p);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export {
  DESIGN_DIR,
  SPEC_FILE,
  designDir,
  designDirState,
  designFile,
  isNotFound,
  specFile,
} from '@modelwright/project/node';
