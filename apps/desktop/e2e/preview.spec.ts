import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickMenu, launch, openByPath, type Launched } from './launch';

/** A dev server that refuses to be framed, and whose page reports what it sees. */
const PAGE = `<!doctype html><meta name="viewport" content="width=device-width">
<body style="margin:0"><pre id="seen"></pre><script>
const seen = () => JSON.stringify({ ua: navigator.userAgent, width: innerWidth,
  dpr: devicePixelRatio, touch: 'ontouchstart' in window, points: navigator.maxTouchPoints });
document.getElementById('seen').textContent = seen();
</script>`;

let run: Launched;
let server: Server;
let url = '';

test.beforeEach(async () => {
  server = createServer((_req, res) =>
    res
      .writeHead(200, {
        'content-type': 'text/html',
        'x-frame-options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'",
      })
      .end(PAGE),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  run = await launch();
});

test.afterEach(async () => {
  await run.close();
  // The preview keeps connections alive; close them so the server can stop.
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

/** What the previewed page reports, read from its own webContents in main. */
function seen(): Promise<{
  ua: string;
  width: number;
  dpr: number;
  touch: boolean;
  points: number;
} | null> {
  return run.app.evaluate(async ({ webContents }, target) => {
    const page = webContents.getAllWebContents().find((w) => w.getURL() === target);
    if (!page || page.isLoading()) return null;
    const text = await page.executeJavaScript(`document.getElementById('seen')?.textContent ?? ''`);
    return text ? JSON.parse(text) : null;
  }, url);
}

async function openWithPreview(): Promise<void> {
  const dir = await run.notesProject();
  const file = path.join(dir, '.design', 'config.json');
  const config = JSON.parse(await readFile(file, 'utf8'));
  config.preview.url = url;
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
  await openByPath(run.window, dir);
  await run.window.getByRole('tab', { name: 'UI' }).click();
}

test('previews a server that sends X-Frame-Options: DENY, as a phone at Mobile', async () => {
  await openWithPreview();
  // Not the "refuses to be embedded" card: the desktop preview is a top-level page.
  await expect(run.window.getByRole('tablist', { name: 'Device' })).toBeVisible();
  await expect.poll(seen, { timeout: 10_000 }).toMatchObject({
    width: 390,
    dpr: 3,
    touch: true,
    points: 5,
  });
  expect((await seen())?.ua).toMatch(/iPhone.*Mobile.*Safari/);
});

test('Desktop clears the emulation, and switching back reloads as a phone', async () => {
  await openWithPreview();
  await run.window.getByRole('tab', { name: 'Desktop' }).click();
  await expect.poll(seen, { timeout: 10_000 }).toMatchObject({ width: 1280, touch: false });
  const desktop = await seen();
  expect(desktop?.ua).not.toMatch(/iPhone|Electron|modelwright/i);
  expect(desktop?.ua).toMatch(/Chrome\//);
  await run.window.getByRole('tab', { name: 'Mobile' }).click();
  await expect.poll(seen, { timeout: 10_000 }).toMatchObject({ width: 390, touch: true });
});

test('the view sits over the device screen, hides with the UI view, and goes with the project', async () => {
  await openWithPreview();
  await expect.poll(seen, { timeout: 10_000 }).not.toBeNull();
  const viewState = () =>
    run.app.evaluate(({ BrowserWindow }) => {
      const views = BrowserWindow.getAllWindows()[0]?.contentView.children ?? [];
      return views.map((v) => ({ visible: v.getVisible(), bounds: v.getBounds() }));
    });
  const screen = await run.window.locator('.native-screen').boundingBox();
  const [view] = await viewState();
  expect(view?.visible).toBe(true);
  expect(Math.abs((view?.bounds.x ?? 0) - (screen?.x ?? -99))).toBeLessThanOrEqual(1);
  expect(Math.abs((view?.bounds.width ?? 0) - (screen?.width ?? -99))).toBeLessThanOrEqual(2);

  await run.window.getByRole('tab', { name: 'ERD' }).click();
  await expect.poll(async () => (await viewState())[0]?.visible).toBe(false);
  await run.window.getByRole('tab', { name: 'UI' }).click();
  await expect.poll(async () => (await viewState())[0]?.visible).toBe(true);

  await clickMenu(run.app, ['File', 'Close Project']);
  await expect.poll(async () => (await viewState()).length).toBe(0);
});

test('an overlay over the preview swaps in a snapshot', async () => {
  await openWithPreview();
  await expect.poll(seen, { timeout: 10_000 }).not.toBeNull();
  await clickMenu(run.app, ['Help', 'Keyboard Shortcuts']);
  await expect(run.window.locator('.native-screen-snapshot')).toBeVisible();
  const visible = () =>
    run.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.contentView.children[0]?.getVisible(),
    );
  await expect.poll(visible).toBe(false);
  await run.window.keyboard.press('Escape');
  await expect.poll(visible).toBe(true);
});

test('quitting after the preview has shown exits (it held the app open once)', async () => {
  await openWithPreview();
  await expect.poll(seen, { timeout: 10_000 }).not.toBeNull();
  await run.window.getByRole('tab', { name: 'ERD' }).click();
  const exited = new Promise<void>((resolve) => run.app.once('close', () => resolve()));
  await run.app.evaluate(({ app }) => app.quit());
  await exited;
});
