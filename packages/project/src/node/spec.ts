import { parseDesignJson, type DesignDocs, type DesignKind, type Issue } from '@modelwright/schema';
import { renderSpec } from '@modelwright/spec';
import { readTextOrNull, writeAtomic } from './fsio';
import { designFile, specFile } from './paths';

/** One design file as found on disk. */
export type LoadedFile<K extends DesignKind> =
  | { status: 'missing' }
  | { status: 'invalid'; issues: Issue[] }
  | { status: 'ok'; doc: DesignDocs[K]; text: string };

export type LoadedDesign = { [K in DesignKind]: LoadedFile<K> };

/** Reads and validates the three design files. */
export async function loadDesign(projectDir: string): Promise<LoadedDesign> {
  const [config, erd, flows] = await Promise.all([
    loadFile(projectDir, 'config'),
    loadFile(projectDir, 'erd'),
    loadFile(projectDir, 'flows'),
  ]);
  return { config, erd, flows };
}

/** The three documents, when all of them are valid. */
export function validDesign(loaded: LoadedDesign): DesignDocs | null {
  const { config, erd, flows } = loaded;
  if (config.status !== 'ok' || erd.status !== 'ok' || flows.status !== 'ok') return null;
  return { config: config.doc, erd: erd.doc, flows: flows.doc };
}

/**
 * Regenerates `.design/spec.md` from the three design files, but only when all three parse:
 * with any of them missing or invalid, the existing spec is left as it is. It's written
 * atomically, and not at all when the text hasn't changed. Returns whether it wrote.
 */
export async function regenerateSpec(projectDir: string): Promise<boolean> {
  const design = validDesign(await loadDesign(projectDir));
  if (!design) return false;
  const text = renderSpec(design.config, design.erd, design.flows);
  const file = specFile(projectDir);
  if ((await readTextOrNull(file)) === text) return false;
  await writeAtomic(file, text);
  return true;
}

async function loadFile<K extends DesignKind>(projectDir: string, kind: K): Promise<LoadedFile<K>> {
  const text = await readTextOrNull(designFile(projectDir, kind));
  if (text === null) return { status: 'missing' };
  const result = parseDesignJson(kind, text);
  return result.ok
    ? { status: 'ok', doc: result.doc, text }
    : { status: 'invalid', issues: result.error.issues };
}
