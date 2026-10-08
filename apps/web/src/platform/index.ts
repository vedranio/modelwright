import type { DesktopApi } from '@modelwright/core/ipc';
import { createHttpClient } from './httpClient';
import { createIpcClient } from './ipcClient';
import type { ProjectClient } from './ProjectClient';

export {
  ProjectClientError,
  type BuildRead,
  type DesignChange,
  type DesignDoc,
  type DesignKind,
  type PreviewCheck,
  type ProjectClient,
  type ProjectSummary,
} from './ProjectClient';
export { ProjectClientProvider, useProjectClient } from './context';

/** The desktop app's preload API, when running inside it. */
export function desktopApi(): DesktopApi | undefined {
  return (globalThis as { modelwright?: DesktopApi }).modelwright;
}

/** The client for this build: IPC inside the desktop app, HTTP to apps/server otherwise. */
export function createDefaultClient(): ProjectClient {
  const api = desktopApi();
  return api ? createIpcClient(api) : createHttpClient();
}
