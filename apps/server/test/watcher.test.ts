import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { DesignWatcher } from '../src/watcher';
import { designPath, designUrl, readDesignText, useSandbox } from './helpers';

const DEBOUNCE = 40;
/** Long enough for fs events to arrive and the debounce to settle. */
const settle = () => new Promise((r) => setTimeout(r, DEBOUNCE * 6));

const sb = useSandbox();
const watchers: DesignWatcher[] = [];
afterEach(() => {
  for (const w of watchers.splice(0)) w.close();
});

function newWatcher() {
  const w = new DesignWatcher(DEBOUNCE);
  watchers.push(w);
  return w;
}

describe('DesignWatcher', () => {
  it('reports one change after an external edit, even one written in several steps', async () => {
    const dir = await sb.notesProject();
    const w = newWatcher();
    const seen: string[] = [];
    await w.subscribe(dir, (kind) => seen.push(kind));
    const text = await readDesignText(dir, 'erd');
    // An editor that writes in steps: truncate, then the full text, then touch again.
    await writeFile(designPath(dir, 'erd'), '');
    await writeFile(designPath(dir, 'erd'), text.replace('"User"', '"Person"'));
    await writeFile(designPath(dir, 'erd'), text.replace('"User"', '"Person"'));
    await settle();
    expect(seen).toEqual(['erd']);
  });

  it("ignores the server's own writes", async () => {
    const dir = await sb.notesProject();
    const w = newWatcher();
    const app = createApp({ homeDir: sb.home, userHome: sb.root, watcher: w });
    const seen: string[] = [];
    await w.subscribe(dir, (kind) => seen.push(kind));
    const erd = JSON.parse(await readDesignText(dir, 'erd'));
    erd.entities[0].name = 'Person';
    const res = await app.request(designUrl('erd', dir), {
      method: 'PUT',
      headers: { host: '127.0.0.1:4301', 'content-type': 'application/json' },
      body: JSON.stringify(erd),
    });
    expect(res.status).toBe(204);
    await settle();
    expect(seen).toEqual([]);
  });

  it('ignores spec.md and every other file', async () => {
    const dir = await sb.notesProject();
    const w = newWatcher();
    const seen: string[] = [];
    await w.subscribe(dir, (kind) => seen.push(kind));
    await writeFile(path.join(dir, '.design', 'spec.md'), '# spec\n');
    await writeFile(path.join(dir, '.design', 'notes.txt'), 'x');
    await settle();
    expect(seen).toEqual([]);
  });

  it('shares one watcher per project and releases it when the last subscriber leaves', async () => {
    const dir = await sb.notesProject();
    const w = newWatcher();
    const a: string[] = [];
    const b: string[] = [];
    const offA = await w.subscribe(dir, (k) => a.push(k));
    const offB = await w.subscribe(dir, (k) => b.push(k));
    expect(w.watching).toBe(1);
    offA();
    expect(w.watching).toBe(1);
    await writeFile(designPath(dir, 'flows'), (await readDesignText(dir, 'flows')) + ' ');
    await settle();
    expect(a).toEqual([]);
    expect(b).toEqual(['flows']);
    offB();
    expect(w.watching).toBe(0);
  });
});

describe('GET /api/design/events', () => {
  it('streams a change event for an external edit', async () => {
    const dir = await sb.notesProject();
    const w = newWatcher();
    const app = createApp({ homeDir: sb.home, userHome: sb.root, watcher: w });
    const res = await app.request(`/api/design/events?path=${encodeURIComponent(dir)}`, {
      headers: { host: '127.0.0.1:4301', origin: 'http://127.0.0.1:4300' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let received = '';
    const readUntil = async (needle: string) => {
      while (!received.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value);
      }
    };
    await readUntil('event: ready');
    await writeFile(designPath(dir, 'config'), (await readDesignText(dir, 'config')) + '\n');
    await readUntil('event: change');
    expect(received).toContain('data: {"kind":"config"}');
    await reader.cancel();
    await settle();
    expect(w.watching).toBe(0);
  });

  it('is behind the guard', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call(
      'GET',
      `/api/design/events?path=${encodeURIComponent(dir)}`,
      undefined,
      {
        origin: 'https://evil.example',
      },
    );
    expect(res.status).toBe(403);
  });

  it('refuses a folder that is not initialised', async () => {
    const dir = await sb.emptyProject();
    const res = await sb.call('GET', `/api/design/events?path=${encodeURIComponent(dir)}`);
    expect(res.status).toBe(409);
  });
});
