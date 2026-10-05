import fs from 'node:fs/promises';
import path from 'node:path';
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
import { readTextOrNull, writeAtomic } from './fsio';
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
export async function initialise(projectDir: string, name: string | undefined): Promise<void> {
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
    await writeAtomic(designFile(projectDir, kind), defaultText(kind, displayName));
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
