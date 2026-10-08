import { STATUS_FOR_CODE, type SerialisedError } from '@modelwright/core/contract';
import type { DesktopApi, InvokeMethod, IpcResult } from '@modelwright/core/ipc';
import { isDesignKind } from '@modelwright/schema';
import { ProjectClientError, type ProjectClient } from './ProjectClient';

/** The desktop app's ProjectClient: calls Electron's main process through the preload's API. */
export function createIpcClient(api: DesktopApi): ProjectClient {
  async function call<T>(
    method: Exclude<InvokeMethod, 'watchDesign' | 'unwatchDesign'>,
    ...args: unknown[]
  ): Promise<T> {
    const result = (await api.invoke(method, ...args)) as IpcResult<T>;
    if (!result.ok) throw ipcError(result.error);
    return result.value;
  }

  return {
    openProject: (path) => call('openProject', path),
    initProject: (path, name) => call('initProject', path, name),
    createProject: (parent, name, git) => call('createProject', parent, name, git),
    listRecent: () => call('listRecent'),
    removeRecent: (path) => call('removeRecent', path),
    readDesign: (path, file) => call('readDesign', path, file),
    writeDesign: (path, file, doc) => call('writeDesign', path, file, doc),
    readBuildRecord: (path) => call('readBuildRecord', path),
    checkPreview: (url) => call('checkPreview', url),
    watchDesign(path, onChange) {
      return api.watchDesign(path, (kind) => {
        if (isDesignKind(kind) || kind === 'build') onChange({ kind });
      });
    },
  };
}

/** A serialised core error as the ProjectClientError the UI expects, with HTTP-style statuses. */
export function ipcError(error: SerialisedError): ProjectClientError {
  if (error.design) {
    return new ProjectClientError(error.message, STATUS_FOR_CODE[error.code], error.design.issues);
  }
  return new ProjectClientError(error.message, STATUS_FOR_CODE[error.code]);
}
