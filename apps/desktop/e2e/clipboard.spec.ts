import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickMenu, launch, openByPath, type Launched } from './launch';

// Cut, copy and paste of cards, through the same calls the Edit menu's native roles make.

let run: Launched;
let saved = '';
test.beforeEach(async () => {
  run = await launch();
  // The tests use the system clipboard; put back what was on it.
  saved = await run.app.evaluate(({ clipboard }) => clipboard.readText());
});
test.afterEach(async () => {
  await run.app.evaluate(({ clipboard }, text) => clipboard.writeText(text), saved).catch(() => {});
  await run.close();
});

type Edit = 'copy' | 'cut' | 'paste';
const edit = (action: Edit) =>
  run.app.evaluate(
    ({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0]?.webContents[a](),
    action,
  );
const clipboardText = () => run.app.evaluate(({ clipboard }) => clipboard.readText());
const entity = (name: string) => run.window.locator('.entity-name', { hasText: name });
const erdOf = async (dir: string) =>
  JSON.parse(await readFile(path.join(dir, '.design', 'erd.json'), 'utf8'));

test('copy and paste an entity, then undo the paste', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await entity('User').click();
  await edit('copy');
  await expect.poll(clipboardText).toContain('"modelwright/cards": 1');
  await edit('paste');
  await expect(entity('User')).toHaveCount(2);
  await expect.poll(async () => (await erdOf(dir)).entities.length).toBe(3);
  // The copy is selected, one grid step from the original.
  await expect(run.window.locator('.react-flow__node.selected')).toHaveCount(1);
  await clickMenu(run.app, ['Edit', 'Undo']);
  await expect(entity('User')).toHaveCount(1);
});

test('cut removes the entities with an undo toast, and paste brings copies back', async () => {
  const dir = await run.notesProject();
  await openByPath(run.window, dir);
  await entity('User').click();
  await entity('Note').click({ modifiers: ['Shift'] });
  await edit('cut');
  await expect(entity('User')).toHaveCount(0);
  await expect(run.window.locator('.toast')).toContainText(/^Cut 'User'|Cut 2 entities/);
  await edit('paste');
  await expect(entity('User')).toHaveCount(1);
  await expect(entity('Note')).toHaveCount(1);
  // The relationship between them came too.
  await expect.poll(async () => (await erdOf(dir)).relationships.length).toBe(1);
});

test('in a text field, copy is the field’s text, not cards', async () => {
  await openByPath(run.window, await run.notesProject());
  await entity('User').dblclick();
  await run.window.getByLabel('Entity name').selectText();
  await edit('copy');
  await expect.poll(clipboardText).toBe('User');
});

test('entities don’t paste into Flows', async () => {
  await openByPath(run.window, await run.notesProject());
  await entity('User').click();
  await edit('copy');
  await run.window.getByRole('tab', { name: 'Flows' }).click();
  const before = await run.window.locator('.react-flow__node').count();
  await run.window.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
  await edit('paste');
  await expect(run.window.locator('.toast')).toContainText('Those are entities');
  expect(await run.window.locator('.react-flow__node').count()).toBe(before);
});

test('screens paste into another project, without its entity references', async () => {
  const from = await run.notesProject('from');
  const to = await run.notesProject('to');
  await openByPath(run.window, from);
  await run.window.getByRole('tab', { name: 'Flows' }).click();
  await run.window
    .locator('.react-flow__node', { has: run.window.locator('.screen-name', { hasText: 'Notes' }) })
    .click({ position: { x: 6, y: 6 } });
  await expect(run.window.locator('.react-flow__node.selected')).toHaveCount(1);
  await edit('copy');
  await expect.poll(clipboardText).toContain('"kind": "flows"');
  await clickMenu(run.app, ['File', 'Close Project']);
  await openByPath(run.window, to);
  await run.window.getByRole('tab', { name: 'Flows' }).click();
  await run.window.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
  await edit('paste');
  const flowsOf = async () =>
    JSON.parse(await readFile(path.join(to, '.design', 'flows.json'), 'utf8'));
  await expect.poll(async () => (await flowsOf()).screens.length).toBe(4);
  const pasted = (await flowsOf()).screens[3];
  expect(pasted.name).toBe('Notes');
  expect(pasted).not.toHaveProperty('entities');
});
