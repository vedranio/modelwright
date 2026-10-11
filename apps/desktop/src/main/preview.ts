import { WebContentsView, session, type BrowserWindow } from 'electron';
import type { PreviewLayout } from '@modelwright/core';
import { isExternalWebUrl } from './origin';
import { emulationFor, viewBounds, type Emulation } from './previewEmulation';

/** The preview's own session: its cookies and storage never mix with modelwright's. */
export const PREVIEW_PARTITION = 'persist:preview';

/**
 * The UI view's preview: the project's dev server in a WebContentsView over the area the
 * renderer lays out for it. A top-level page, so frame-blocking headers don't apply, and
 * emulated through the DevTools protocol so Mobile is a phone, user agent and touch included.
 */
export class Preview {
  private view: WebContentsView | null = null;
  /** The URL and reload count last loaded. */
  private loaded: string | null = null;
  private emulation: string | null = null;
  private mobile: boolean | null = null;
  /** Set while the window closes or the app quits: no new view may be made then. */
  private closing = false;
  /** Settles once the new view has rendered its first (blank) page. */
  private ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly window: () => BrowserWindow | null,
    private readonly openExternal: (url: string) => void,
  ) {
    session
      .fromPartition(PREVIEW_PARTITION)
      .setPermissionRequestHandler((_c, _p, callback) => callback(false));
  }

  /** Updates run one at a time, in order, so a page never loads before its emulation. */
  private queue: Promise<void> = Promise.resolve();

  set(layout: PreviewLayout | null): Promise<void> {
    const run = this.queue.then(() => this.apply(layout));
    this.queue = run.catch((err: unknown) => console.error('modelwright: preview', err));
    return this.queue;
  }

  private async apply(layout: PreviewLayout | null): Promise<void> {
    if (!layout) return this.remove();
    const view = this.ensure();
    if (!view) return;
    view.setBounds(viewBounds(layout.bounds));
    view.setBorderRadius(Math.round(layout.radius));
    view.setVisible(layout.visible);

    const contents = view.webContents;
    const emulation = emulationFor(layout, session.fromPartition(PREVIEW_PARTITION).getUserAgent());
    const key = JSON.stringify(emulation);
    if (key !== this.emulation) {
      this.emulation = key;
      // Emulating a view that hasn't rendered anything yet crashes Electron's main process.
      await this.ready;
      await applyEmulation(contents.debugger, emulation);
    }
    // A new user agent and touch support only reach the page when it loads again.
    const switched = this.mobile !== null && this.mobile !== layout.mobile;
    this.mobile = layout.mobile;
    const target = `${layout.url}#${layout.reload}`;
    if (target !== this.loaded || switched) {
      this.loaded = target;
      contents.loadURL(layout.url).catch(() => {
        // The page shows its own error; the UI view's check reports a stopped server.
      });
    }
  }

  async snapshot(): Promise<string | null> {
    if (!this.view) return null;
    const image = await this.view.webContents.capturePage();
    return image.isEmpty() ? null : image.toDataURL();
  }

  /**
   * Removes the view for good while the window closes or the app quits. The renderer can still
   * send layouts as it saves, and a view made then held the app open after `will-quit`.
   */
  shutDown(): void {
    this.closing = true;
    this.remove();
  }

  /** Allows a view again, for a new window. */
  reopen(): void {
    this.closing = false;
  }

  remove(): void {
    const view = this.view;
    if (!view) return;
    this.view = null;
    this.loaded = this.emulation = null;
    this.mobile = null;
    this.window()?.contentView.removeChildView(view);
    const contents = view.webContents;
    if (contents.isDestroyed()) return;
    // An attached debugger keeps the view's contents alive, and with them the app on quit.
    if (contents.debugger.isAttached()) contents.debugger.detach();
    contents.close();
  }

  private ensure(): WebContentsView | null {
    if (this.view) return this.view;
    if (this.closing) return null;
    const win = this.window();
    if (!win) return null;
    const view = new WebContentsView({
      webPreferences: {
        partition: PREVIEW_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
      },
    });
    view.setBackgroundColor('#ffffff');
    const contents = view.webContents;
    // Links that open windows go to the default browser; the page itself stays on the web.
    contents.setWindowOpenHandler(({ url }) => {
      this.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!isExternalWebUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('render-process-gone', (_event, details) =>
      console.error('modelwright: preview renderer gone', details),
    );
    contents.debugger.attach('1.3');
    win.contentView.addChildView(view);
    this.ready = contents.loadURL('about:blank').catch(() => {});
    this.view = view;
    return view;
  }
}

async function applyEmulation(cdp: Electron.Debugger, e: Emulation): Promise<void> {
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', e.metrics);
  await cdp.sendCommand('Emulation.setUserAgentOverride', e.userAgent);
  await cdp.sendCommand('Emulation.setTouchEmulationEnabled', e.touch);
  await cdp.sendCommand('Emulation.setEmitTouchEventsForMouse', e.mouseAsTouch);
}
