import type { SerialisedError } from './contract';

/**
 * The desktop app's IPC surface: channel names and the API the preload exposes. Types and
 * constants only, so the sandboxed preload and the web app can import it without pulling in
 * anything else.
 */

/** The ProjectClient methods with an `invoke` channel each, `mw:<method>`. */
export const INVOKE_METHODS = [
  'openProject',
  'initProject',
  'createProject',
  'listRecent',
  'removeRecent',
  'readDesign',
  'writeDesign',
  'readBuildRecord',
  'checkPreview',
  'watchDesign',
  'unwatchDesign',
] as const;
export type InvokeMethod = (typeof INVOKE_METHODS)[number];

export function invokeChannel(method: InvokeMethod): string {
  return `mw:${method}`;
}

/** Main → renderer: a watched project's file changed, `{ id, kind }`. */
export const DESIGN_CHANGE_CHANNEL = 'mw:design-change';

/** An IPC call's outcome. Errors are values: thrown errors lose their shape crossing IPC. */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: SerialisedError };

export interface DesignChangeEvent {
  /** The subscription it belongs to. */
  id: string;
  kind: string;
}

/** What the preload exposes as `window.modelwright`. Never `ipcRenderer` itself. */
export interface DesktopApi {
  /** Calls one ProjectClient method in main. Arguments are validated there. */
  invoke(
    method: Exclude<InvokeMethod, 'watchDesign' | 'unwatchDesign'>,
    ...args: unknown[]
  ): Promise<IpcResult<unknown>>;
  /** Watches a project; `onChange` gets each change's kind. Returns the function that stops it. */
  watchDesign(path: string, onChange: (kind: string) => void): () => void;
}
