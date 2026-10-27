import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickMenu, launch, openByPath, stubFolderDialog, type Launched } from './launch';

let run: Launched;
test.beforeEach(async () => {
  run = await launch();
});
test.afterEach(async () => {
  await run.close();
});

const tab = (name: string) => run.window.getByRole('tab', { name });

test('opens an existing project with the native folder dialog', async () => {
  const dir = await run.notesProject();
  await stubFolderDialog(run.app, dir);
  await run.window.getByRole('button', { name: /Open an existing project…/ }).click();
  await expect(tab('ERD')).toBeVisible();
  // The pasted path is still there as a fallback.
  await clickMenu(run.app, ['File', 'Close Project']);
  await expect(run.window.getByRole('button', { name: 'or paste a path' })).toBeVisible();
});

test('chooses a new project’s location with the native dialog', async () => {
  await stubFolderDialog(run.app, run.root);
  await run.window.getByRole('button', { name: 'Choose…' }).click();
  await expect(run.window.locator('#new-project-location')).toHaveValue(run.root);
  await run.window.locator('#new-project-name').fill('Fresh');
  await run.window.getByRole('button', { name: /Create project/ }).click();
  await expect(tab('ERD')).toBeVisible();
  expect(await readFile(path.join(run.root, 'Fresh', '.design', 'config.json'), 'utf8')).toContain(
    'Fresh',
  );
});

test('File ▸ Open… replaces the open project, saving it first', async () => {
  const first = await run.notesProject('first');
  const second = await run.notesProject('second');
  await openByPath(run.window, first);
  await stubFolderDialog(run.app, second);
  await clickMenu(run.app, ['File', 'Open…']);
  await expect(run.window.locator('.project-path')).toHaveText(/second$/);
});

test('the View menu switches views, and Edit ▸ Undo undoes a canvas edit', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await clickMenu(run.app, ['View', 'Flows']);
  await expect(tab('Flows')).toHaveAttribute('aria-selected', 'true');
  await clickMenu(run.app, ['View', 'ERD']);
  await expect(tab('ERD')).toHaveAttribute('aria-selected', 'true');

  await run.window.getByRole('button', { name: /Add entity/ }).click();
  await run.window.keyboard.press('Escape');
  const count = () => run.window.locator('.react-flow__node').count();
  await expect.poll(count).toBe(3);
  await run.window.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await clickMenu(run.app, ['Edit', 'Undo']);
  await expect.poll(count).toBe(2);
  await clickMenu(run.app, ['Edit', 'Redo']);
  await expect.poll(count).toBe(3);
});

test('Edit ▸ Undo goes to a focused text field, not the canvas', async () => {
  await run.window.locator('#new-project-name').fill('');
  await run.window.locator('#new-project-name').pressSequentially('abc');
  await clickMenu(run.app, ['Edit', 'Undo']);
  await expect(run.window.locator('#new-project-name')).not.toHaveValue('abc');
});

test('View ▸ Reload Design re-reads the files, and its ⌘R hint shows', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await expect(run.window.getByRole('button', { name: /Reload/ })).toContainText('⌘R');
  const file = path.join(dir, '.design', 'erd.json');
  const erd = JSON.parse(await readFile(file, 'utf8'));
  erd.entities[0].name = 'Reloaded';
  // Written as modelwright would never write it, then reloaded by the menu.
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, JSON.stringify(erd));
  await clickMenu(run.app, ['View', 'Reload Design']);
  await expect(run.window.locator('.entity-name', { hasText: 'Reloaded' })).toBeVisible();
});

test('View ▸ Theme sets the page and native theme', async () => {
  await clickMenu(run.app, ['View', 'Theme', 'Dark']);
  await expect(run.window.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() => run.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe('dark');
  await clickMenu(run.app, ['View', 'Theme', 'System']);
  await expect(run.window.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('project commands are disabled in the picker; Open Recent lists recents', async () => {
  const enabled = () =>
    run.app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()?.items.find((m) => m.label === 'File');
      return file?.submenu?.items.find((m) => m.label === 'Close Project')?.enabled;
    });
  await expect.poll(enabled).toBe(false);
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await expect.poll(enabled).toBe(true);
  await clickMenu(run.app, ['File', 'Close Project']);
  await expect(run.window.getByRole('dialog', { name: 'Create or open a project' })).toBeVisible();
  await clickMenu(run.app, ['File', 'Open Recent', 'Notes']);
  await expect(tab('ERD')).toBeVisible();
});

test('remembers the window’s size and place', async () => {
  await run.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 40, y: 60, width: 1100, height: 700 }),
  );
  const file = path.join(run.root, 'home', 'desktop', 'window.json');
  await expect
    .poll(async () => JSON.parse(await readFile(file, 'utf8').catch(() => '{}')))
    .toMatchObject({ width: 1100, height: 700 });
});

test('opening a folder handed over by the OS (the Dock) opens it as a project', async () => {
  const dir = await run.notesProject();
  await run.app.evaluate(
    ({ app }, folder) => app.emit('open-file', { preventDefault() {} }, folder),
    dir,
  );
  await expect(tab('ERD')).toBeVisible();
});

test('quitting with an unsaved edit saves it first, and reopens the project next time', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await run.window.locator('.entity-name', { hasText: 'User' }).click();
  await run.window.getByLabel('Entity name').fill('Quitter');
  await run.window.getByLabel('Entity name').press('Enter');
  // Quit straight away, inside the autosave pause.
  const closed = new Promise<void>((resolve) => run.app.once('close', () => resolve()));
  await run.app.evaluate(({ app }) => app.quit());
  await closed;
  const erd = JSON.parse(await readFile(path.join(dir, '.design', 'erd.json'), 'utf8'));
  expect(erd.entities[0].name).toBe('Quitter');

  await run.relaunch();
  await expect(run.window.locator('.entity-name', { hasText: 'Quitter' })).toBeVisible();
});
