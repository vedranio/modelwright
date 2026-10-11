import type { DesktopApi } from '@modelwright/core/ipc';

/** The desktop app's preload API, when running inside it; undefined in a browser. */
export function desktopApi(): DesktopApi | undefined {
  return (globalThis as { modelwright?: DesktopApi }).modelwright;
}
