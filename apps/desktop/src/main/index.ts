import os from 'node:os';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  shell,
  type WebContents,
} from 'electron';
import {
  HOST_COMMAND_CHANNEL,
  createCore,
  invokeChannel,
  type HostCommand,
  type HostState,
  type InvokeMethod,
} from '@modelwright/core';
import { createIpcHandlers, type HostCalls, type IpcHandlers } from './ipc';
import { buildMenuTemplate, recentItems, type MenuContext } from './menu';
import { APP_ORIGIN, isExternalWebUrl, isOnOrigin } from './origin';
import { DESKTOP_DATA, MODELWRIGHT_HOME, PRELOAD_FILE, RENDERER_DIR, demoTemplate } from './paths';
import { registerAppScheme, serveRenderer } from './protocol';
import {
  MIN_SIZE,
  loadWindowState,
  restoreBounds,
  saveWindowState,
  windowStateFile,
} from './windowState';

// Electron's profile lives in modelwright's folder, so the app writes nothing elsewhere.
app.setName('modelwright');
app.setPath('userData', DESKTOP_DATA);
registerAppScheme();

// One window, one instance: a second launch hands over to the first.
if (!app.requestSingleInstanceLock()) app.quit();

/** electron-vite's dev server in development (HMR); the bundled renderer otherwise. */
const DEV_URL = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
const RENDERER_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;
const isTrusted = (url: string) => isOnOrigin(url, RENDERER_ORIGIN);

/** The ports `pnpm dev` and the desktop dev server use: a preview there is modelwright itself. */
const TOOL_PORTS = [4300, 4301, 4302];

/** Calls after which the recent projects (File ▸ Open Recent, the Dock) may have changed. */
const CHANGES_RECENTS: readonly InvokeMethod[] = [
  'openProject',
  'initProject',
  'createProject',
  'removeRecent',
  'writeDesign',
];

let mainWindow: BrowserWindow | null = null;
let hostState: HostState = { projectOpen: false, theme: 'system' };
/** Whether the renderer has reported its state, so commands for it have somewhere to go. */
let rendererReady = false;
/** Commands that arrived before the renderer could take them (a folder dropped on launch). */
const queued: HostCommand[] = [];
/** A close or quit waiting for the renderer to save the project. */
let pendingClose: 'close' | 'quit' | null = null;
/** Set once the renderer has saved: the next close or quit goes ahead. */
let closeAllowed = false;

function openExternal(url: string): void {
  if (isExternalWebUrl(url)) void shell.openExternal(url);
}

function send(command: HostCommand): void {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed() || !rendererReady) {
    queued.push(command);
    if (!mainWindow && app.isReady()) mainWindow = createWindow();
    return;
  }
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  contents.send(HOST_COMMAND_CHANNEL, command);
}

/** Opens a project folder handed over by the OS (the Dock, Finder, a second launch). */
function openPath(folder: string): void {
  send({ id: 'open-path', path: path.resolve(folder) });
}

let handlers: IpcHandlers;
let core: ReturnType<typeof createCore>;

let recents: MenuContext['recents'] = [];

function applyMenus(): void {
  const context: MenuContext = { ...hostState, recents, send };
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(context)));
  app.dock?.setMenu(Menu.buildFromTemplate(recentItems(context)));
}

/** Rebuilds the menus at once from what's known, then again with fresh recents. */
async function refreshMenus(): Promise<void> {
  applyMenus();
  recents = await core.listRecent().catch(() => recents);
  applyMenus();
}

const host: HostCalls = {
  async chooseFolder(_sender, purpose, defaultPath) {
    const options = {
      title: purpose === 'open' ? 'Open a project' : 'Choose where the project goes',
      buttonLabel: purpose === 'open' ? 'Open' : 'Choose',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      ...(defaultPath && { defaultPath: expandHome(defaultPath) }),
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  },

  setHostState(_sender, state) {
    hostState = state;
    nativeTheme.themeSource = state.theme;
    if (!rendererReady) {
      rendererReady = true;
      for (const command of queued.splice(0)) send(command);
    }
    void refreshMenus();
  },

  readyToClose() {
    const action = pendingClose;
    pendingClose = null;
    closeAllowed = true;
    if (action === 'quit') app.quit();
    else mainWindow?.close();
  },
};

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

function registerIpc(): void {
  for (const method of handlers.methods) {
    ipcMain.handle(invokeChannel(method), async (event, ...args: unknown[]) => {
      const result = await handlers.handle(
        method,
        {
          id: event.sender.id,
          url: event.senderFrame?.url ?? '',
          send: (channel, payload) => {
            if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
          },
        },
        args,
      );
      if (result.ok && CHANGES_RECENTS.includes(method)) void refreshMenus();
      return result;
    });
  }
}

/** Navigation and new windows are denied; web links go to the default browser. */
function harden(contents: WebContents): void {
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
  // Once the renderer has saved (or the user chose to drop the edits), its beforeunload guard
  // mustn't silently cancel the close.
  contents.on('will-prevent-unload', (event) => {
    if (closeAllowed) event.preventDefault();
  });
  // A reload or a crashed renderer starts again with no watches.
  contents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (!isMainFrame || isSameDocument) return;
    handlers.releaseSender(contents.id);
    rendererReady = false;
  });
  contents.on('render-process-gone', () => {
    rendererReady = false;
  });
  contents.on('destroyed', () => handlers.releaseSender(contents.id));
}

function createWindow(): BrowserWindow {
  const stateFile = windowStateFile(DESKTOP_DATA);
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: 'modelwright',
    titleBarStyle: 'hiddenInset',
    // Centred on the 44px header.
    trafficLightPosition: { x: 16, y: 15 },
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
  harden(win.webContents);
  rendererReady = false;

  void loadWindowState(stateFile).then((saved) => {
    const { bounds, maximized } = restoreBounds(
      saved,
      screen.getAllDisplays().map((d) => d.workArea),
    );
    win.setBounds(bounds);
    if (maximized) win.maximize();
    win.show();
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const rememberBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      void saveWindowState(stateFile, {
        ...win.getNormalBounds(),
        maximized: win.isMaximized(),
      }).catch(() => {});
    }, 300);
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);

  // Closing the window with a project open saves it first, as Close Project does.
  win.on('close', (event) => {
    if (closeAllowed || !hostState.projectOpen || !rendererReady) return;
    event.preventDefault();
    pendingClose = 'close';
    send({ id: 'close-for-quit' });
  });
  win.on('closed', () => {
    clearTimeout(saveTimer);
    if (mainWindow === win) mainWindow = null;
    closeAllowed = false;
    rendererReady = false;
  });

  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
}

// A folder dropped on the Dock icon, or opened with the app from Finder. Can come before ready.
app.on('open-file', (event, folder) => {
  event.preventDefault();
  openPath(folder);
});

app.on('second-instance', () => send({ id: 'focus' }));

// Quitting with a project open saves it first, or asks, as closing it does.
app.on('before-quit', (event) => {
  if (closeAllowed || !mainWindow || !hostState.projectOpen || !rendererReady) return;
  event.preventDefault();
  pendingClose = 'quit';
  send({ id: 'close-for-quit' });
});

void app.whenReady().then(() => {
  // modelwright's pages never need a permission (camera, notifications, …).
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  if (!DEV_URL) serveRenderer(RENDERER_DIR);

  core = createCore({
    homeDir: MODELWRIGHT_HOME,
    toolPorts: TOOL_PORTS,
    demoTemplate: demoTemplate(app.isPackaged),
  });
  handlers = createIpcHandlers(core, { isTrusted, toolOrigin: RENDERER_ORIGIN, host });
  registerIpc();
  void refreshMenus();
  mainWindow = createWindow();

  app.on('activate', () => {
    if (!mainWindow) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
