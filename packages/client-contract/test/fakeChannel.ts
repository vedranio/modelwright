import type { DesignChangeEvent, InvokeMethod } from '@modelwright/core';
import type { IpcHandlers } from '../../../apps/desktop/src/main/ipc';
import type { RendererChannel } from '../../../apps/desktop/src/preload/api';

let nextSenderId = 1;

/**
 * Joins a renderer-side channel to the main handlers the way Electron does: every argument and
 * result is structured-cloned, and main's events reach the renderer's listeners.
 */
export function fakeChannel(handlers: IpcHandlers, url = 'app://modelwright/index.html') {
  const id = nextSenderId++;
  const listeners = new Map<string, ((event: unknown, payload: DesignChangeEvent) => void)[]>();
  const renderer: RendererChannel = {
    async invoke(channel, ...args) {
      const method = channel.replace(/^mw:/, '') as InvokeMethod;
      const sender = {
        id,
        url,
        send: (ch: string, payload: DesignChangeEvent) => {
          for (const l of listeners.get(ch) ?? []) l({}, structuredClone(payload));
        },
      };
      return structuredClone(await handlers.handle(method, sender, structuredClone(args)));
    },
    on(channel, listener) {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
    },
  };
  return { id, renderer };
}
