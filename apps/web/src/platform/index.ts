import { desktopApi } from './desktop';
import { createHttpClient } from './httpClient';
import { createIpcClient } from './ipcClient';
import type { ProjectClient } from './ProjectClient';

export {
  ProjectClientError,
  type BuildRead,
  type ClientCapabilities,
  type DesignChange,
  type DesignDoc,
  type DesignKind,
  type DevServerEvent,
  type DevServerState,
  type PreviewCheck,
  type ProjectClient,
  type ProjectSummary,
  type StartDevServerResult,
} from './ProjectClient';
export { ProjectClientProvider, useProjectClient } from './context';
export { desktopApi } from './desktop';
export {
  desktopHost,
  type Host,
  type HostCommand,
  type HostState,
  type PreviewLayout,
} from './host';

/** The client for this build: IPC inside the desktop app, HTTP to apps/server otherwise. */
export function createDefaultClient(): ProjectClient {
  const api = desktopApi();
  return api ? createIpcClient(api) : createHttpClient();
}
