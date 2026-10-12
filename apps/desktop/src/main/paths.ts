import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** modelwright's own folder, shared with the web build: recents, the demo. */
export const MODELWRIGHT_HOME =
  process.env['MODELWRIGHT_HOME'] ?? path.join(os.homedir(), '.modelwright');

/** Electron's own profile (storage, caches, window state), kept inside modelwright's folder. */
export const DESKTOP_DATA = path.join(MODELWRIGHT_HOME, 'desktop');

/** The built renderer and preload, beside this bundle (`out/main/index.js`). */
export const RENDERER_DIR = fileURLToPath(new URL('../renderer', import.meta.url));
export const PRELOAD_FILE = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));

/** The demo template: in the app's resources when packaged, in packages/core otherwise. */
export function demoTemplate(packaged: boolean): string {
  return packaged
    ? path.join(process.resourcesPath, 'demo', 'todo')
    : fileURLToPath(new URL('../../../../packages/core/demo/todo', import.meta.url));
}
