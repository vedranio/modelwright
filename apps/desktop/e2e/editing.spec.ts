import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { launch, openByPath, type Launched } from './launch';

// Phases 2–6's editing features, in the desktop app: toasts with Undo, the build indicator and
// Revert all, and the conflict banner for an outside edit made while there are unsaved edits.

const CLI = fileURLToPath(
  new URL('../../../plugins/modelwright/bin/modelwright-design', import.meta.url),
);

let run: Launched;
test.beforeEach(async () => {
  run = await launch();
});
test.afterEach(async () => {
  await run.close();
});

const entity = (name: string) => run.window.locator('.entity-name', { hasText: name });
const erdOf = async (dir: string) =>
  JSON.parse(await readFile(path.join(dir, '.design', 'erd.json'), 'utf8'));

async function rename(from: string, to: string): Promise<void> {
  await entity(from).dblclick();
  await run.window.getByLabel('Entity name').fill(to);
  await run.window.getByLabel('Entity name').press('Enter');
}

test('deleting an entity shows a toast whose Undo brings it back', async () => {
  await openByPath(run.window, await run.notesProject());
  await entity('Note').click();
  await run.window.keyboard.press('Backspace');
  await expect(entity('Note')).toHaveCount(0);
  const toast = run.window.locator('.toast');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(entity('Note')).toBeVisible();
});

test('the build indicator counts changes since the build, and Revert all undoes them', async () => {
  const dir = await run.notesProject();
  await promisify(execFile)(process.execPath, [CLI, 'record-build', dir]);
  await openByPath(run.window, dir);
  await expect(run.window.locator('.build-indicator-button')).toContainText(/Built/);

  await rename('Note', 'Memo');
  await expect(run.window.locator('.build-indicator-button')).toContainText('1 change');
  await run.window.locator('.build-indicator-button').click();
  await run.window.getByRole('button', { name: 'Revert all' }).click();
  await run.window
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Revert/ })
    .click();
  await expect(entity('Note')).toBeVisible();
  await expect.poll(async () => (await erdOf(dir)).entities[1].name).toBe('Note');
});

test('an outside edit during unsaved edits asks which to keep', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await run.window.waitForTimeout(500); // watching starts once the project is open
  await rename('User', 'Mine');
  // Within the autosave pause, a text editor saves the file too.
  const theirs = await erdOf(dir);
  theirs.entities[1].name = 'Theirs';
  await writeFile(path.join(dir, '.design', 'erd.json'), JSON.stringify(theirs, null, 2));
  const banner = run.window.getByRole('alert').filter({ hasText: 'changed outside modelwright' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Keep mine' }).click();
  await expect.poll(async () => (await erdOf(dir)).entities[0].name).toBe('Mine');
  expect((await erdOf(dir)).entities[1].name).toBe('Note');
});
