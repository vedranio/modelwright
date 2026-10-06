import fs from 'node:fs/promises';
import path from 'node:path';
import type { DesignKind } from '@modelwright/schema';

export const DESIGN_DIR = '.design';
/** The generated spec beside the design files. */
export const SPEC_FILE = 'spec.md';
/** The build record, written by the CLI after a verified build. */
export const BUILD_FILE = 'build.json';

export function designDir(projectDir: string): string {
  return path.join(projectDir, DESIGN_DIR);
}

/**
 * `<project>/.design/<name>`, re-checked to sit directly inside `.design/`. Every file modelwright
 * or the CLI touches is built here, from one of a few fixed names.
 */
function inDesignDir(projectDir: string, name: string): string {
  const dir = designDir(projectDir);
  const file = path.join(dir, name);
  if (path.dirname(file) !== dir) throw new Error(`Refusing to touch a file outside ${dir}`);
  return file;
}

/** `<project>/.design/<kind>.json`. */
export function designFile(projectDir: string, kind: DesignKind): string {
  return inDesignDir(projectDir, `${kind}.json`);
}

/** `<project>/.design/spec.md`. */
export function specFile(projectDir: string): string {
  return inDesignDir(projectDir, SPEC_FILE);
}

/** `<project>/.design/build.json`. */
export function buildFile(projectDir: string): string {
  return inDesignDir(projectDir, BUILD_FILE);
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

export function isNotFound(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR');
}
