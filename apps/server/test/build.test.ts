import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringifyBuildRecord, type BuildRecord } from '@modelwright/schema';
import { DesignWatcher } from '../src/watcher';
import { designUrl, json, listDesignDir, readDesignText, useSandbox } from './helpers';

const sb = useSandbox();
const buildPath = (dir: string) => path.join(dir, '.design', 'build.json');
const buildUrl = (dir: string) => `/api/design/build?path=${encodeURIComponent(dir)}`;

/** A valid build record of the project's current design. */
async function writeRecord(dir: string): Promise<BuildRecord> {
  const doc = async (kind: string) => JSON.parse(await readDesignText(dir, kind));
  const record: BuildRecord = {
    schemaVersion: 1,
    builtAt: '2026-10-06T09:30:00.000Z',
    snapshot: { config: await doc('config'), erd: await doc('erd'), flows: await doc('flows') },
    map: { screens: { login: ['src/routes/login.tsx'] } },
  };
  await writeFile(buildPath(dir), stringifyBuildRecord(record));
  return record;
}

describe('GET /api/design/build', () => {
  it('says there is none when build.json is missing', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call('GET', buildUrl(dir));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ status: 'none' });
  });

  it('returns a valid record', async () => {
    const dir = await sb.notesProject();
    const record = await writeRecord(dir);
    const res = await sb.call('GET', buildUrl(dir));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ status: 'ok', record });
  });

  it('returns the problems of an invalid record, with paths', async () => {
    const dir = await sb.notesProject();
    await writeRecord(dir);
    const record = JSON.parse(await readFile(buildPath(dir), 'utf8'));
    record.snapshot.erd.entities[0].attributes[0].type = 'string';
    await writeFile(buildPath(dir), JSON.stringify(record));
    const body = await json(await sb.call('GET', buildUrl(dir)));
    expect(body.status).toBe('invalid');
    expect(body.issues).toContainEqual({
      path: ['snapshot', 'erd', 'entities', 0, 'attributes', 0, 'type'],
      message: 'Unknown key "type"',
    });
  });

  it('is behind the guard', async () => {
    const dir = await sb.notesProject();
    await writeRecord(dir);
    const res = await sb.call('GET', buildUrl(dir), undefined, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('needs a project path', async () => {
    expect((await sb.call('GET', '/api/design/build')).status).toBe(400);
  });
});

describe('the server never writes build.json', () => {
  it('refuses a PUT of build.json and writes nothing', async () => {
    const dir = await sb.notesProject();
    const before = await listDesignDir(dir);
    const res = await sb.call('PUT', designUrl('build', dir), { schemaVersion: 1 });
    expect(res.status).toBe(400);
    expect(await listDesignDir(dir)).toEqual(before);
  });

  it('leaves build.json untouched when a design file is saved', async () => {
    const dir = await sb.notesProject();
    await writeRecord(dir);
    const text = await readFile(buildPath(dir), 'utf8');
    const erd = JSON.parse(await readDesignText(dir, 'erd'));
    erd.entities[0].name = 'Person';
    expect((await sb.call('PUT', designUrl('erd', dir), erd)).status).toBe(204);
    expect(await readFile(buildPath(dir), 'utf8')).toBe(text);
  });
});

describe('watching build.json', () => {
  const watchers: DesignWatcher[] = [];
  afterEach(() => {
    for (const w of watchers.splice(0)) w.close();
  });

  it('reports a new or changed build.json as kind "build"', async () => {
    const dir = await sb.notesProject();
    const w = new DesignWatcher(40);
    watchers.push(w);
    const seen: string[] = [];
    await w.subscribe(dir, (kind) => seen.push(kind));
    await writeRecord(dir);
    await new Promise((r) => setTimeout(r, 240));
    expect(seen).toEqual(['build']);
  });
});
