import { parseDesignJson, type Config, type Erd, type Flows } from '@modelwright/schema';
import { renderSpec } from '@modelwright/spec';
import { readTextOrNull, writeAtomic } from './fsio';
import { designFile, specFile } from './paths';

/**
 * Regenerates `.design/spec.md` from the three design files, but only when all three parse:
 * with any of them missing or invalid, the existing spec is left as it is. It's written
 * atomically, and not at all when the text hasn't changed. Returns whether it wrote.
 */
export async function regenerateSpec(projectDir: string): Promise<boolean> {
  const [config, erd, flows] = await Promise.all([
    load(projectDir, 'config'),
    load(projectDir, 'erd'),
    load(projectDir, 'flows'),
  ]);
  if (!config || !erd || !flows) return false;
  const text = renderSpec(config as Config, erd as Erd, flows as Flows);
  const file = specFile(projectDir);
  if ((await readTextOrNull(file)) === text) return false;
  await writeAtomic(file, text);
  return true;
}

async function load(projectDir: string, kind: 'config' | 'erd' | 'flows') {
  const text = await readTextOrNull(designFile(projectDir, kind));
  if (text === null) return null;
  const result = parseDesignJson(kind, text);
  return result.ok ? result.doc : null;
}
