import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const MAIN = fileURLToPath(new URL('../out/main/index.js', import.meta.url));
export const NOTES_FIXTURE = fileURLToPath(
  new URL('../../../packages/schema/test/fixtures/notes', import.meta.url),
);

export interface Launched {
  app: ElectronApplication;
  window: Page;
  /** A temp folder holding modelwright's home and the test's projects. */
  root: string;
  notesProject(name?: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Launches modelwright with its own temp home, so nothing touches the real recents. The
 * packaged binary when MODELWRIGHT_APP names it, the built `out/` otherwise.
 */
export async function launch(): Promise<Launched> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'modelwright-e2e-'));
  const packaged = process.env['MODELWRIGHT_APP'];
  const app = await electron.launch({
    ...(packaged ? { executablePath: packaged, args: [] } : { args: [MAIN] }),
    env: { ...process.env, MODELWRIGHT_HOME: path.join(root, 'home') } as Record<string, string>,
  });
  const window = await app.firstWindow();
  return {
    app,
    window,
    root,
    async notesProject(name = 'notes') {
      const dir = path.join(root, name);
      await cp(NOTES_FIXTURE, path.join(dir, '.design'), { recursive: true });
      return dir;
    },
    async close() {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Opens a project through the picker's pasted-path field. */
export async function openByPath(window: Page, dir: string): Promise<void> {
  await window.getByRole('button', { name: /Open an existing project/ }).click();
  await window.getByLabel('Project folder').fill(dir);
  await window.getByLabel('Project folder').press('Enter');
  await window.getByRole('tablist', { name: 'View' }).waitFor();
}
