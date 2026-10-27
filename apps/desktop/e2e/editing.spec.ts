import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { clickMenu, launch, openByPath, type Launched } from './launch';

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
const card = (name: string) => run.window.locator('.react-flow__node', { has: entity(name) });
/**
 * Another app taking focus. Playwright makes a page always report focus, so this fakes what
 * the field sees: `document.hasFocus()` false, then the blur. The browser giving focus back on
 * return can't be simulated; it's on the hand-check list.
 */
const background = () =>
  run.window.evaluate(() => {
    document.hasFocus = () => false;
    (document.activeElement as HTMLElement | null)?.blur();
  });
const foreground = () =>
  run.window.evaluate(() => {
    delete (document as { hasFocus?: unknown }).hasFocus;
  });
const erdOf = async (dir: string) =>
  JSON.parse(await readFile(path.join(dir, '.design', 'erd.json'), 'utf8'));

async function rename(from: string, to: string): Promise<void> {
  await entity(from).click();
  await run.window.getByLabel('Entity name').fill(to);
  await run.window.getByLabel('Entity name').press('Enter');
}

test('deleting an entity shows a toast whose Undo brings it back', async () => {
  await openByPath(run.window, await run.notesProject());
  // A click on the card's text edits it, so select it by its corner.
  await card('Note').click({ position: { x: 3, y: 3 } });
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

test('an open field stays open while the app is in the background, and saves on quit', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await entity('User').click();
  const field = run.window.getByLabel('Entity name');
  await field.fill('Mem');
  // Another app takes focus: the window blurs, but the field mustn't commit and close.
  await background();
  await expect(field).toBeVisible();
  await foreground();
  await field.focus();
  await run.window.keyboard.type('ber');
  await expect(field).toHaveValue('Member');
  // Background again, then close the project from the menu: the open field is saved first.
  await background();
  await expect(field).toBeVisible();
  await clickMenu(run.app, ['File', 'Close Project']);
  await expect
    .poll(async () => (await erdOf(dir)).entities.map((e: { name: string }) => e.name))
    .toContain('Member');
});

test('⌥-dragging an entity copies it and leaves the original in place', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  const box = await card('Note').boundingBox();
  if (!box) throw new Error('Note has no box');
  const { mouse, keyboard } = run.window;
  await mouse.move(box.x + 3, box.y + 3);
  await keyboard.down('Alt');
  await mouse.down();
  await mouse.move(box.x + 3, box.y + 200, { steps: 10 });
  await mouse.up();
  await keyboard.up('Alt');
  await expect(entity('Note')).toHaveCount(2);
  await expect.poll(async () => (await erdOf(dir)).entities.length).toBe(3);
  const erd = await erdOf(dir);
  expect(erd.layout.note).toEqual({ x: 320, y: 0 });
  const copy = erd.entities.at(-1);
  expect(copy.name).toBe('Note');
  expect(erd.layout[copy.id].y).toBeGreaterThan(100);
});

test('dragging an attribute by its grip reorders it', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  const title = run.window.locator('.attribute', { hasText: 'title' });
  await title.hover();
  const grip = await title.locator('.row-grip').boundingBox();
  const updated = await run.window.locator('.attribute', { hasText: 'updated at' }).boundingBox();
  if (!grip || !updated) throw new Error('missing boxes');
  const { mouse } = run.window;
  await mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await mouse.down();
  await mouse.move(grip.x, updated.y + updated.height - 2, { steps: 8 });
  await mouse.up();
  await expect
    .poll(async () =>
      (await erdOf(dir)).entities[1].attributes.map((a: { name: string }) => a.name),
    )
    .toEqual(['body', 'updated at', 'title']);
});
