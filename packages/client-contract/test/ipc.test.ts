import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach } from 'vitest';
import { DesignWatcher, DevServers, createCore } from '@modelwright/core';
import { createIpcHandlers, type IpcHandlers } from '../../../apps/desktop/src/main/ipc';
import { createDesktopApi } from '../../../apps/desktop/src/preload/api';
import { createIpcClient } from '../../../apps/web/src/platform/ipcClient';
import { runProjectClientContract } from '../src/contract';
import { fakeChannel } from './fakeChannel';

// The ProjectClient contract against ipcClient: the real preload API and main handlers,
// joined by a fake channel that serialises like IPC does.

const NOTES = fileURLToPath(new URL('../../schema/test/fixtures/notes', import.meta.url));

let root = '';
let watcher: DesignWatcher;
let devServers: DevServers;
/** A dev command that prints `ready` and keeps running, run through a plain shell in tests. */
const DEV_COMMAND = `${JSON.stringify(process.execPath)} -e "console.log('ready'); setInterval(() => {}, 1000)"`;
const SH = { file: '/bin/sh', args: (command: string) => ['-c', command] };

let handlers: IpcHandlers;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'modelwright-contract-ipc-'));
  watcher = new DesignWatcher(40);
  devServers = new DevServers({ homeDir: path.join(root, '.modelwright'), shell: SH });
  const core = createCore({
    devServers,
    homeDir: path.join(root, '.modelwright'),
    userHome: root,
    toolPorts: [4300, 4301],
    watcher,
  });
  handlers = createIpcHandlers(core, {
    isTrusted: (url) => url.startsWith('app://modelwright/'),
    toolOrigin: 'app://modelwright',
  });
});

afterEach(async () => {
  watcher.close();
  devServers.stopAll(500);
  await rm(root, { recursive: true, force: true });
});

runProjectClientContract('ipcClient', {
  client: () => createIpcClient(createDesktopApi(fakeChannel(handlers).renderer)),
  async emptyProject(name = 'empty') {
    const dir = path.join(root, name);
    await mkdir(dir);
    return dir;
  },
  async notesProject(name = 'notes') {
    const dir = path.join(root, name);
    await cp(NOTES, path.join(dir, '.design'), { recursive: true });
    return dir;
  },
  home: () => root,
  devCommand: DEV_COMMAND,
  readText: (project, kind) => readFile(path.join(project, '.design', `${kind}.json`), 'utf8'),
  writeText: (project, kind, text) =>
    writeFile(path.join(project, '.design', `${kind}.json`), text),
});
