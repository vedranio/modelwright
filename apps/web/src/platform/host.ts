import type { HostCommand, HostState } from '@modelwright/core/ipc';
import { desktopApi } from './desktop';

export type { HostCommand, HostState };

/**
 * The desktop app around the page: its menu, Dock and windows. None in the web build, where
 * the browser is the host and these things don't exist.
 */
export interface Host {
  /** Menu, Dock and OS commands. Returns the function that stops listening. */
  onCommand(listener: (command: HostCommand) => void): () => void;
  /** Tells main what the menu should enable and which theme the native UI uses. */
  setState(state: HostState): void;
  /** The project's edits are saved (or knowingly dropped): a pending close or quit can go ahead. */
  readyToClose(): void;
}

let cached: Host | null | undefined;

/** The desktop host, or null in the web build. The same object every call. */
export function desktopHost(): Host | null {
  if (cached !== undefined) return cached;
  const api = desktopApi();
  if (!api) return (cached = null);
  return (cached = {
    onCommand: (listener) => api.onCommand(listener),
    setState: (state) => void api.invoke('setHostState', state),
    readyToClose: () => void api.invoke('readyToClose'),
  });
}
