import {
  DESIGN_CHANGE_CHANNEL,
  DEV_SERVER_CHANNEL,
  HOST_COMMAND_CHANNEL,
  INVOKE_METHODS,
  invokeChannel,
  type DesignChangeEvent,
  type DevServerEventMessage,
  type DesktopApi,
  type HostCommand,
  type IpcResult,
} from '@modelwright/core/ipc';

/** The part of `ipcRenderer` the API uses, so tests can drive it over a fake channel. */
export interface RendererChannel {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  /** Payloads arrive untyped, as from any IPC channel. */
  on(channel: string, listener: (event: unknown, payload: unknown) => void): void;
}

/**
 * The renderer's only way into main: one narrow, typed object. It forwards known methods to
 * their channels and never hands out the channel itself. Main validates every argument again.
 */
export function createDesktopApi(ipc: RendererChannel): DesktopApi {
  const listeners = new Map<string, (kind: string) => void>();
  ipc.on(DESIGN_CHANGE_CHANNEL, (_event, payload) => {
    const change = payload as DesignChangeEvent;
    listeners.get(change.id)?.(change.kind);
  });
  const devServerListeners = new Map<string, Parameters<DesktopApi['watchDevServer']>[1]>();
  ipc.on(DEV_SERVER_CHANNEL, (_event, payload) => {
    const message = payload as DevServerEventMessage;
    devServerListeners.get(message.id)?.(message.event);
  });

  /**
   * Subscribes through a watch/unwatch pair of channels. A stop that comes before the watch has
   * started still unwatches it once it has.
   */
  function subscribe<L>(
    watch: 'watchDesign' | 'watchDevServer',
    unwatch: 'unwatchDesign' | 'unwatchDevServer',
    listeners: Map<string, L>,
    path: string,
    listener: L,
  ): () => void {
    let id: string | null = null;
    let stopped = false;
    void (ipc.invoke(invokeChannel(watch), path) as Promise<IpcResult<string>>).then((result) => {
      // As with EventSource, a failed watch is silent; the focus re-read still catches up.
      if (!result.ok) return;
      id = result.value;
      if (stopped) void ipc.invoke(invokeChannel(unwatch), id);
      else listeners.set(id, listener);
    });
    return () => {
      stopped = true;
      if (id === null) return;
      listeners.delete(id);
      void ipc.invoke(invokeChannel(unwatch), id);
    };
  }

  const commandListeners = new Set<(command: HostCommand) => void>();
  ipc.on(HOST_COMMAND_CHANNEL, (_event, payload) => {
    for (const listener of commandListeners) listener(payload as HostCommand);
  });

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
      return subscribe('watchDesign', 'unwatchDesign', listeners, path, onChange);
    },

    watchDevServer(path, onEvent) {
      return subscribe('watchDevServer', 'unwatchDevServer', devServerListeners, path, onEvent);
    },

    onCommand(listener) {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
  };
}
