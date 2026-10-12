import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach } from 'vitest';
import { DesignWatcher, DevServers } from '@modelwright/core';
import { createApp } from '../../../apps/server/src/app';
import { createHttpClient } from '../../../apps/web/src/platform/httpClient';
import { runProjectClientContract } from '../src/contract';

// The ProjectClient contract against httpClient, with requests sent straight into the app.

const NOTES = fileURLToPath(new URL('../../schema/test/fixtures/notes', import.meta.url));

let root = '';
let app: ReturnType<typeof createApp>;
let watcher: DesignWatcher;
let devServers: DevServers;
/** A dev command that prints `ready` and keeps running, run through a plain shell in tests. */
const DEV_COMMAND = `${JSON.stringify(process.execPath)} -e "console.log('ready'); setInterval(() => {}, 1000)"`;
const SH = { file: '/bin/sh', args: (command: string) => ['-c', command] };

const sources: SseSource[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'modelwright-contract-http-'));
  watcher = new DesignWatcher(40);
  const homeDir = path.join(root, '.modelwright');
  devServers = new DevServers({ homeDir, shell: SH });
  app = createApp({ homeDir, userHome: root, watcher, devServers });
});

afterEach(async () => {
  for (const s of sources.splice(0)) s.close();
  watcher.close();
  devServers.stopAll(500);
  await rm(root, { recursive: true, force: true });
});

const appFetch: typeof fetch = (input, init) =>
  Promise.resolve(
    app.request(String(input), {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), host: '127.0.0.1:4301' },
    }),
  );

/** Just enough of EventSource for httpClient: `change` events parsed from the app's stream. */
class SseSource {
  private readonly listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
  private readonly abort = new AbortController();

  constructor(url: string) {
    sources.push(this);
    void this.read(url);
  }

  addEventListener(type: string, listener: (e: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.abort.abort();
  }

  private async read(url: string): Promise<void> {
    try {
      const res = await appFetch(url, { signal: this.abort.signal });
      if (!res.body) return;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done || this.abort.signal.aborted) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          this.dispatch(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
        }
      }
      await reader.cancel();
    } catch {
      // Closed.
    }
  }

  private dispatch(block: string): void {
    const field = (name: string) =>
      block
        .split('\n')
        .find((line) => line.startsWith(`${name}:`))
        ?.slice(name.length + 1)
        .trim();
    const type = field('event');
    if (!type) return;
    const event = { data: field('data') ?? '' } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

runProjectClientContract('httpClient', {
  client: () =>
    createHttpClient('/api', {
      fetch: appFetch,
      EventSource: SseSource as unknown as typeof EventSource,
    }),
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
