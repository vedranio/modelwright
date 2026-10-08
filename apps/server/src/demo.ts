import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextOrNull, regenerateSpec, writeAtomic } from '@modelwright/project/node';
import type { Recents } from './recents';

/**
 * The demo project's template: design files only, shipped with the server. It's never opened
 * in place, so editing the demo never changes the modelwright repo. The same relative path
 * works from `src/` (dev) and `dist/` (the built server).
 */
export const DEMO_TEMPLATE = fileURLToPath(new URL('../demo/todo', import.meta.url));

/** Where an install's own copy of the demo lives, inside modelwright's home directory. */
export function demoDir(homeDir: string): string {
  return path.join(homeDir, 'demo', 'todo');
}

/** Present once the demo has been offered, so dismissing it is permanent. */
const OFFERED_MARKER = 'demo-offered';

/**
 * Offers the demo project once per install: copies the template into modelwright's home and
 * adds it to the end of the recents, then records that it was offered. It's never offered
 * again, so once dismissed (or dropped off the recents) it stays gone. A copy left from
 * before is reused, so edits to the demo survive. Failures are logged, never fatal: the
 * picker works without a demo.
 */
export async function offerDemo(
  homeDir: string,
  recents: Recents,
  template: string,
): Promise<void> {
  const marker = path.join(homeDir, OFFERED_MARKER);
  if ((await readTextOrNull(marker)) !== null) return;
  try {
    const dir = demoDir(homeDir);
    const existing = await fs.stat(dir).catch(() => null);
    if (!existing) {
      await fs.mkdir(path.dirname(dir), { recursive: true });
      await fs.cp(template, dir, { recursive: true, errorOnExist: true, force: false });
      await regenerateSpec(dir);
    }
    await recents.addLast({ path: dir, name: 'Todo' });
    await writeAtomic(marker, `${new Date().toISOString()}\n`);
  } catch (err) {
    console.error('Couldn’t set up the demo project', err);
  }
}
