import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  DESIGN_KINDS,
  defaultConfig,
  defaultErd,
  defaultFlows,
  parseDesignJson,
  stringifyDesign,
  type DesignKind,
  type ProjectSummary,
} from '@modelwright/schema';
import { readTextOrNull, writeAtomic } from '@modelwright/project/node';
import { HttpError, designDir, designDirState, designFile, statOrNull, tildify } from './paths';

/** Whether `.design/` is a real directory holding all three files. */
export async function isInitialised(projectDir: string): Promise<boolean> {
  if ((await designDirState(projectDir)) !== 'dir') return false;
  const stats = await Promise.all(DESIGN_KINDS.map((k) => statOrNull(designFile(projectDir, k))));
  return stats.every((s) => s?.isFile() === true);
}

/** The project's display name: `config.json`'s name when it parses, otherwise the folder name. */
export async function projectName(projectDir: string): Promise<string> {
  const text = await readTextOrNull(designFile(projectDir, 'config'));
  if (text !== null) {
    const result = parseDesignJson('config', text);
    if (result.ok) return result.doc.name;
  }
  return folderName(projectDir);
}

export async function summarise(projectDir: string, userHome: string): Promise<ProjectSummary> {
  const [name, initialised] = await Promise.all([
    projectName(projectDir),
    isInitialised(projectDir),
  ]);
  return { path: projectDir, displayPath: tildify(projectDir, userHome), name, initialised };
}

/**
 * Creates whichever of the three design files are missing, never overwriting one.
 * Refuses with 409 when all three already exist.
 */
export async function initialise(
  projectDir: string,
  name: string | undefined,
  /** Told about each file before it's written, so the watcher can ignore it. */
  onWrite: (kind: DesignKind, text: string) => void = () => {},
): Promise<void> {
  const state = await designDirState(projectDir);
  if (state === 'invalid') {
    throw new HttpError(409, `${designDir(projectDir)} exists but is not a folder`);
  }
  if (state === 'missing') await fs.mkdir(designDir(projectDir));

  const missing: DesignKind[] = [];
  for (const kind of DESIGN_KINDS) {
    if (!(await statOrNull(designFile(projectDir, kind)))) missing.push(kind);
  }
  if (missing.length === 0) {
    throw new HttpError(409, `modelwright is already initialised in ${projectDir}`);
  }

  const displayName = name?.trim() || folderName(projectDir);
  for (const kind of missing) {
    const text = defaultText(kind, displayName);
    onWrite(kind, text);
    await writeAtomic(designFile(projectDir, kind), text);
  }
}

function defaultText(kind: DesignKind, name: string): string {
  switch (kind) {
    case 'erd':
      return stringifyDesign('erd', defaultErd());
    case 'flows':
      return stringifyDesign('flows', defaultFlows());
    case 'config':
      return stringifyDesign('config', defaultConfig(name));
  }
}

function folderName(projectDir: string): string {
  return path.basename(projectDir) || projectDir;
}

/** How long `git init` may take before it counts as failed. */
const GIT_TIMEOUT_MS = 10_000;

/**
 * A new project's folder name: the name as typed, trimmed. It must be a single folder name,
 * so path separators, `.`, `..` and control characters are refused.
 */
export function projectFolderName(name: string): string {
  const folder = name.trim();
  if (folder === '') throw new HttpError(400, 'Give the project a name');
  const control = [...folder].some((ch) => ch.charCodeAt(0) < 0x20);
  if (folder === '.' || folder === '..' || /[/\\]/.test(folder) || control) {
    throw new HttpError(400, 'The name can’t contain / or \\, or be . or ..');
  }
  return folder;
}

/**
 * Creates a new project: the folder `<parent>/<name>/`, which must not exist yet, then its
 * `.design/` with the three files (`initialise`), and optionally a git repository. This is the
 * one place modelwright creates anything outside a `.design/` folder: an empty project folder,
 * never anything inside an existing one. Returns the new project's folder.
 */
export async function createProject(
  parent: string,
  name: string,
  options: {
    git: boolean;
    /** Told about each design file before it's written, so the watcher can ignore it. */
    onWrite?: (dir: string, kind: DesignKind, text: string) => void;
  },
): Promise<string> {
  const folder = projectFolderName(name);
  const dir = path.join(parent, folder);
  if (path.dirname(dir) !== parent) throw new HttpError(400, 'The name must be one folder name');
  if (await statOrNull(dir)) {
    throw new HttpError(409, `There's already a folder called ${folder} there`);
  }
  if (options.git) await requireGit();
  // Not recursive: the parent was checked to exist, and an existing folder is never reused.
  await fs.mkdir(dir);
  await initialise(dir, name.trim(), (kind, text) => options.onWrite?.(dir, kind, text));
  if (options.git) {
    try {
      await promisify(execFile)('git', ['init', '--quiet'], { cwd: dir, timeout: GIT_TIMEOUT_MS });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new HttpError(409, `Created ${folder}, but git init failed: ${detail}`);
    }
  }
  return dir;
}

/** Fails before anything is created when git can't be run. */
async function requireGit(): Promise<void> {
  try {
    await promisify(execFile)('git', ['--version'], { timeout: GIT_TIMEOUT_MS });
  } catch {
    throw new HttpError(400, 'git isn’t installed, so a repository can’t be initialised');
  }
}
