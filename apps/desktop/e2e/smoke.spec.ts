import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launch, openByPath } from './launch';

// The brief's smoke test, run against the packaged app with `pnpm e2e:packaged`: launch, open a
// temp project, edit an entity and see the file change, switch views, quit.
test('smoke: launch, open, edit, switch views, quit', async () => {
  const run = await launch();
  const { window } = run;

  // The demo comes from the app's own resources on a fresh install.
  await expect(window.getByText('Demo project')).toBeVisible();
  expect(await readdir(path.join(run.root, 'home', 'demo', 'todo', '.design'))).toContain(
    'spec.md',
  );

  const dir = await run.notesProject();
  await openByPath(window, dir);
  await window.locator('.entity-name', { hasText: 'Note' }).click();
  await window.getByLabel('Entity name').fill('Memo');
  await window.getByLabel('Entity name').press('Enter');
  const erd = () => readFile(path.join(dir, '.design', 'erd.json'), 'utf8');
  await expect.poll(async () => JSON.parse(await erd()).entities[1].name).toBe('Memo');
  expect(await readFile(path.join(dir, '.design', 'spec.md'), 'utf8')).toContain('Memo');

  for (const name of ['Flows', 'UI', 'ERD']) {
    await window.getByRole('tab', { name }).click();
    await expect(window.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  }

  const exited = new Promise<void>((resolve) => run.app.once('close', () => resolve()));
  await run.app.evaluate(({ app }) => app.quit());
  await exited;
  await run.close();
});
