import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickMenu, launch, openByPath, type Launched } from './launch';

// Starting the project's dev server from the app, through the user's real login shell.

/** The project's "dev server": serves a page, says where, and records its pid. */
const SERVER = `
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const port = Number(process.argv[2]);
writeFileSync('server.pid', String(process.pid));
createServer((_q, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>Dev page</h1>'))
  .listen(port, '127.0.0.1', () => console.log('  Local:   http://localhost:' + port + '/'));
`;

let run: Launched;
test.beforeEach(async () => {
  run = await launch();
});
test.afterEach(async () => {
  await run.close();
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

async function project(devCommand: (port: number) => string) {
  const dir = await run.notesProject();
  const port = await freePort();
  await writeFile(path.join(dir, 'server.mjs'), SERVER);
  const file = path.join(dir, '.design', 'config.json');
  const config = JSON.parse(await readFile(file, 'utf8'));
  config.preview = { url: `http://localhost:${port}`, devCommand: devCommand(port) };
  await writeFile(file, JSON.stringify(config, null, 2));
  return { dir, port };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const pidOf = async (dir: string) => Number(await readFile(path.join(dir, 'server.pid'), 'utf8'));

async function openUi(dir: string) {
  await openByPath(run.window, dir);
  await run.window.getByRole('tab', { name: 'UI' }).click();
}

const page = () =>
  run.app.evaluate(async ({ webContents }) => {
    const view = webContents
      .getAllWebContents()
      .find((w) => w.getURL().startsWith('http://localhost'));
    return view && !view.isLoading()
      ? view.executeJavaScript('document.querySelector("h1")?.textContent ?? null')
      : null;
  });

test('starts the dev server once approved, previews it, and stops it', async () => {
  const { dir } = await project((port) => `node server.mjs ${port}`);
  await openUi(dir);
  await run.window.getByRole('button', { name: 'Start dev server' }).click();
  const dialog = run.window.getByRole('alertdialog', { name: 'Run this command?' });
  await expect(dialog).toContainText(/node server\.mjs \d+/);
  await dialog.getByRole('button', { name: /^Run/ }).click();

  await expect.poll(page, { timeout: 20_000 }).toBe('Dev page');
  const pid = await pidOf(dir);
  expect(alive(pid)).toBe(true);
  await expect(run.window.locator('.devlog-head')).toContainText('running');

  await run.window.locator('.devlog-head').getByRole('button', { name: 'Stop' }).click();
  await expect(run.window.getByText('Nothing running at')).toBeVisible({ timeout: 10_000 });
  expect(alive(pid)).toBe(false);

  // Approved now: starting again asks nothing.
  await run.window.getByRole('button', { name: 'Start dev server' }).click();
  await expect.poll(page, { timeout: 20_000 }).toBe('Dev page');
  await expect(run.window.getByRole('alertdialog')).toHaveCount(0);
});

test('closing the project, or quitting, stops its dev server', async () => {
  const { dir } = await project((port) => `node server.mjs ${port}`);
  await openUi(dir);
  await run.window.getByRole('button', { name: 'Start dev server' }).click();
  await run.window.getByRole('alertdialog').getByRole('button', { name: /^Run/ }).click();
  await expect.poll(page, { timeout: 20_000 }).toBe('Dev page');
  const first = await pidOf(dir);
  await clickMenu(run.app, ['File', 'Close Project']);
  await expect.poll(() => alive(first), { timeout: 10_000 }).toBe(false);

  await openUi(dir);
  await run.window.getByRole('button', { name: 'Start dev server' }).click();
  await expect.poll(page, { timeout: 20_000 }).toBe('Dev page');
  const second = await pidOf(dir);
  expect(second).not.toBe(first);
  const exited = new Promise<void>((resolve) => run.app.once('close', () => resolve()));
  await run.app.evaluate(({ app }) => app.quit());
  await exited;
  await expect.poll(() => alive(second), { timeout: 5_000 }).toBe(false);
});

test('a crash shows its exit code and output, with Start again', async () => {
  const { dir } = await project(
    () => `node -e "console.error('boom: no such module'); process.exit(2)"`,
  );
  await openUi(dir);
  await run.window.getByRole('button', { name: 'Start dev server' }).click();
  await run.window.getByRole('alertdialog').getByRole('button', { name: /^Run/ }).click();
  await expect(run.window.getByText(/The dev server stopped \(exit 2\)/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(run.window.locator('.devlog-body')).toContainText('boom: no such module');
  await expect(run.window.getByRole('button', { name: 'Start again' })).toBeVisible();
});
