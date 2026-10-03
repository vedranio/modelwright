import fs from 'node:fs/promises';
import path from 'node:path';
import type { DesignKind } from '@modelwright/schema';

export const DESIGN_DIR = '.design';

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

export function designDir(projectDir: string): string {
  return path.join(projectDir, DESIGN_DIR);
}

/**
 * The one place a design file path is built. `kind` is already one of three literals, and the
 * result is re-checked to sit directly inside `<project>/.design/`, so nothing else is writable.
 */
export function designFile(projectDir: string, kind: DesignKind): string {
  const dir = designDir(projectDir);
  const file = path.join(dir, `${kind}.json`);
  if (path.dirname(file) !== dir) {
    throw new HttpError(400, `Refusing to touch a file outside ${dir}`);
  }
  return file;
}

/**
 * Returns how `.design/` exists: missing, a real directory, or something else. A symlinked
 * `.design/` is treated as "something else" so writes can't be redirected outside the project.
 */
export async function designDirState(projectDir: string): Promise<'missing' | 'dir' | 'invalid'> {
  try {
    const stat = await fs.lstat(designDir(projectDir));
    return stat.isDirectory() ? 'dir' : 'invalid';
  } catch (err) {
    if (isNotFound(err)) return 'missing';
    throw err;
  }
}

export async function statOrNull(p: string) {
  try {
    return await fs.stat(p);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR');
}
