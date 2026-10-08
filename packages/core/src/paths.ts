import fs from 'node:fs/promises';
import path from 'node:path';
import { isNotFound } from '@modelwright/project/node';

import { CoreError } from './errors';

/**
 * Validates a project path from a request: it must be an absolute path to an existing directory.
 * Returns it normalised, so `..` segments are resolved before anything else uses it.
 */
export async function resolveProjectDir(raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new CoreError('invalid-argument', 'A project path is required');
  }
  if (!path.isAbsolute(raw)) {
    throw new CoreError('invalid-argument', `Project path must be absolute: ${raw}`);
  }
  const dir = path.resolve(raw);
  const stat = await statOrNull(dir);
  if (!stat) throw new CoreError('not-found', `No folder at ${dir}`);
  if (!stat.isDirectory()) throw new CoreError('invalid-argument', `Not a folder: ${dir}`);
  return dir;
}

/**
 * A folder for a new project to go in, as typed: an absolute path, or one starting with `~`
 * for the user's home. It must be an existing folder. Returned resolved.
 */
export async function resolveParentDir(raw: unknown, home: string): Promise<string> {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new CoreError('invalid-argument', 'Choose where the project goes');
  }
  const typed = raw.trim();
  const expanded =
    typed === '~' ? home : typed.startsWith('~/') ? path.join(home, typed.slice(2)) : typed;
  return resolveProjectDir(expanded);
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
  BUILD_FILE,
  DESIGN_DIR,
  SPEC_FILE,
  buildFile,
  designDir,
  designDirState,
  designFile,
  isNotFound,
  specFile,
} from '@modelwright/project/node';
