import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, openByPath, type Launched } from './launch';

let run: Launched;
test.beforeEach(async () => {
  run = await launch();
});
test.afterEach(async () => {
  await run.close();
});

test('the renderer has no Node access, and only the narrow API', async () => {
  const { window } = run;
  expect(
    await window.evaluate(() => [
      typeof (globalThis as Record<string, unknown>)['require'],
      typeof (globalThis as Record<string, unknown>)['process'],
      Object.keys((globalThis as Record<string, object>)['modelwright'] ?? {}).sort(),
    ]),
  ).toEqual(['undefined', 'undefined', ['invoke', 'watchDesign']]);
});

test('malformed IPC calls are rejected in main', async () => {
  const results = await run.window.evaluate(async () => {
    const api = (
      globalThis as unknown as { modelwright: { invoke(...a: unknown[]): Promise<unknown> } }
    ).modelwright;
    return Promise.all([
      api.invoke('openProject', 42),
      api.invoke('readDesign', '/tmp', '../../etc/passwd'),
      api.invoke('writeDesign', '/tmp', 'build', {}),
      api.invoke('shell.openExternal', 'file:///'),
    ]);
  });
  for (const result of results) {
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-argument' } });
  }
});

test('opens a project, shows every view, and saves an edit to disk', async () => {
  const { window } = run;
  const dir = await run.notesProject();
  await openByPath(window, dir);

  await expect(window.locator('.entity-name', { hasText: 'User' })).toBeVisible();
  await window.locator('.entity-name', { hasText: 'User' }).dblclick();
  await window.getByLabel('Entity name').fill('Member');
  await window.getByLabel('Entity name').press('Enter');
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(path.join(dir, '.design', 'erd.json'), 'utf8')).entities[0].name,
      {
        timeout: 5000,
      },
    )
    .toBe('Member');

  await window.getByRole('tab', { name: 'Flows' }).click();
  await expect(window.locator('.react-flow__node').first()).toBeVisible();
  await window.getByRole('tab', { name: 'UI' }).click();
  await expect(window.getByRole('tab', { name: 'UI' })).toHaveAttribute('aria-selected', 'true');
  await window.keyboard.press('1');
  await expect(window.getByRole('tab', { name: 'ERD' })).toHaveAttribute('aria-selected', 'true');
});

test('an external edit to erd.json updates the canvas', async () => {
  const { window } = run;
  const dir = await run.notesProject();
  await openByPath(window, dir);
  const file = path.join(dir, '.design', 'erd.json');
  const erd = JSON.parse(await readFile(file, 'utf8'));
  erd.entities[0].name = 'Editor';
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, `${JSON.stringify(erd, null, 2)}\n`);
  await expect(window.locator('.entity-name', { hasText: 'Editor' })).toBeVisible({
    timeout: 5000,
  });
});
