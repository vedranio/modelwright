import { createHttpClient } from './httpClient';
import type { ProjectClient } from './ProjectClient';

export {
  ProjectClientError,
  type DesignDoc,
  type DesignKind,
  type ProjectClient,
  type ProjectSummary,
} from './ProjectClient';
export { ProjectClientProvider, useProjectClient } from './context';

/** The client for this build. Electron will return an IPC client here instead. */
export function createDefaultClient(): ProjectClient {
  return createHttpClient();
}
