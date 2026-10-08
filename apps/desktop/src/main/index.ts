import { app, BrowserWindow, ipcMain, session, shell, type WebContents } from 'electron';
import { createCore, invokeChannel } from '@modelwright/core';
import { createIpcHandlers, type IpcHandlers } from './ipc';
import { APP_ORIGIN, isExternalWebUrl, isOnOrigin } from './origin';
import { DESKTOP_DATA, MODELWRIGHT_HOME, PRELOAD_FILE, RENDERER_DIR, demoTemplate } from './paths';
import { registerAppScheme, serveRenderer } from './protocol';

// Electron's profile lives in modelwright's folder, so the app writes nothing elsewhere.
app.setName('modelwright');
app.setPath('userData', DESKTOP_DATA);
registerAppScheme();

/** electron-vite's dev server in development (HMR); the bundled renderer otherwise. */
const DEV_URL = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
const RENDERER_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;
const isTrusted = (url: string) => isOnOrigin(url, RENDERER_ORIGIN);

/** The ports `pnpm dev` uses: a preview URL there is the web build, not a project. */
const TOOL_PORTS = [4300, 4301, 4302];

function openExternal(url: string): void {
  if (isExternalWebUrl(url)) void shell.openExternal(url);
}

function registerIpc(handlers: IpcHandlers): void {
  for (const method of handlers.methods) {
    ipcMain.handle(invokeChannel(method), (event, ...args: unknown[]) =>
      handlers.handle(
        method,
        {
          id: event.sender.id,
          url: event.senderFrame?.url ?? '',
          send: (channel, payload) => {
            if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
          },
        },
        args,
      ),
    );
  }
}

/** Navigation and new windows are denied; web links go to the default browser. */
function harden(contents: WebContents, handlers: IpcHandlers): void {
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isTrusted(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  // A reload or a crashed renderer starts again with no watches.
  contents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) handlers.releaseSender(contents.id);
  });
  contents.on('destroyed', () => handlers.releaseSender(contents.id));
}

function createWindow(handlers: IpcHandlers): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'modelwright',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  harden(win.webContents, handlers);
  win.once('ready-to-show', () => win.show());
  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
}

void app.whenReady().then(() => {
  // modelwright's pages never need a permission (camera, notifications, …).
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  if (!DEV_URL) serveRenderer(RENDERER_DIR);

  const core = createCore({
    homeDir: MODELWRIGHT_HOME,
    toolPorts: TOOL_PORTS,
    demoTemplate: demoTemplate(app.isPackaged),
  });
  const handlers = createIpcHandlers(core, { isTrusted, toolOrigin: RENDERER_ORIGIN });
  registerIpc(handlers);
  createWindow(handlers);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(handlers);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
