import {
  DESIGN_CHANGE_CHANNEL,
  INVOKE_METHODS,
  invokeChannel,
  type DesignChangeEvent,
  type DesktopApi,
  type IpcResult,
} from '@modelwright/core/ipc';

/** The part of `ipcRenderer` the API uses, so tests can drive it over a fake channel. */
export interface RendererChannel {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, payload: DesignChangeEvent) => void): void;
}

/**
 * The renderer's only way into main: one narrow, typed object. It forwards known methods to
 * their channels and never hands out the channel itself. Main validates every argument again.
 */
export function createDesktopApi(ipc: RendererChannel): DesktopApi {
  const listeners = new Map<string, (kind: string) => void>();
  ipc.on(DESIGN_CHANGE_CHANNEL, (_event, change) => listeners.get(change.id)?.(change.kind));

  return {
    invoke(method, ...args) {
      if (!(INVOKE_METHODS as readonly string[]).includes(method)) {
        return Promise.resolve({
          ok: false,
          error: { code: 'invalid-argument', message: `Unknown method ${String(method)}` },
        });
      }
      return ipc.invoke(invokeChannel(method), ...args) as Promise<IpcResult<unknown>>;
    },

    watchDesign(path, onChange) {
      let id: string | null = null;
      let stopped = false;
      void (ipc.invoke(invokeChannel('watchDesign'), path) as Promise<IpcResult<string>>).then(
        (result) => {
          // As with EventSource, a failed watch is silent; the focus re-read still catches up.
          if (!result.ok) return;
          id = result.value;
          if (stopped) void ipc.invoke(invokeChannel('unwatchDesign'), id);
          else listeners.set(id, onChange);
        },
      );
      return () => {
        stopped = true;
        if (id === null) return;
        listeners.delete(id);
        void ipc.invoke(invokeChannel('unwatchDesign'), id);
      };
    },
  };
}
