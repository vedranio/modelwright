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
  /** Launches again with the same home, after the app has quit. */
  relaunch(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Launches modelwright with its own temp home, so nothing touches the real recents. The
 * packaged binary when MODELWRIGHT_APP names it, the built `out/` otherwise.
 */
export async function launch(): Promise<Launched> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'modelwright-e2e-'));
  const packaged = process.env['MODELWRIGHT_APP'];
  const start = () =>
    electron.launch({
      ...(packaged ? { executablePath: packaged, args: [] } : { args: [MAIN] }),
      env: { ...process.env, MODELWRIGHT_HOME: path.join(root, 'home') } as Record<string, string>,
    });
  const app = await start();
  if (process.env['MODELWRIGHT_E2E_LOGS']) {
    app.process().stdout?.on('data', (d) => process.stdout.write(`[main] ${d}`));
    app.process().stderr?.on('data', (d) => process.stderr.write(`[main] ${d}`));
  }
  const run: Launched = {
    app,
    window: await app.firstWindow(),
    root,
    async relaunch() {
      run.app = await start();
      run.window = await run.app.firstWindow();
    },
    async notesProject(name = 'notes') {
      const dir = path.join(root, name);
      await cp(NOTES_FIXTURE, path.join(dir, '.design'), { recursive: true });
      return dir;
    },
    async close() {
      await run.app.close().catch(() => {});
      await rm(root, { recursive: true, force: true });
    },
  };
  return run;
}

/** Opens a project through the picker's pasted-path field, the fallback to the dialog. */
export async function openByPath(window: Page, dir: string): Promise<void> {
  await window.getByRole('button', { name: 'or paste a path' }).click();
  await window.getByLabel('Project folder').fill(dir);
  await window.getByLabel('Project folder').press('Enter');
  await window.getByRole('tablist', { name: 'View' }).waitFor();
}

/** Clicks an application menu item by its labels, e.g. `['View', 'Flows']`. */
export async function clickMenu(app: ElectronApplication, labels: string[]): Promise<void> {
  await app.evaluate(({ Menu }, path) => {
    let items = Menu.getApplicationMenu()?.items ?? [];
    for (const [i, label] of path.entries()) {
      const item = items.find((m) => m.label === label);
      if (!item) throw new Error(`No menu item ${path.slice(0, i + 1).join(' ▸ ')}`);
      if (i === path.length - 1) {
        if (!item.enabled) throw new Error(`${label} is disabled`);
        (item.click as () => void)();
        return;
      }
      items = item.submenu?.items ?? [];
    }
  }, labels);
}

/** Makes the next native folder dialog choose `folder`, as if picked by hand. */
export async function stubFolderDialog(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never;
  }, folder);
}
