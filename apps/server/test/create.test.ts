import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDesignJson } from '@modelwright/schema';
import { FIXED_NOW, json, listDesignDir, readDesignText, useSandbox } from './helpers';

const sb = useSandbox();
const create = (body: unknown) => sb.call('POST', '/api/projects/create', body);

describe('POST /api/projects/create', () => {
  it('creates the folder, its .design/ and spec, and lists it in recents', async () => {
    const parent = await sb.emptyProject('code');
    const res = await create({ parent, name: 'PhotoBackup' });
    expect(res.status).toBe(201);
    const dir = path.join(parent, 'PhotoBackup');
    expect(await json(res)).toEqual({
      path: dir,
      displayPath: '~/code/PhotoBackup',
      name: 'PhotoBackup',
      initialised: true,
      lastOpenedAt: FIXED_NOW,
    });
    expect(await listDesignDir(dir)).toEqual(['config.json', 'erd.json', 'flows.json', 'spec.md']);
    const config = parseDesignJson('config', await readDesignText(dir, 'config'));
    expect(config.ok && config.doc.name).toBe('PhotoBackup');
    expect(await readdir(dir)).toEqual(['.design']);
    const recents = await json(await sb.call('GET', '/api/projects/recent'));
    expect(recents[0].path).toBe(dir);
  });

  it('accepts ~ for the user’s home as the location', async () => {
    await sb.emptyProject('code');
    const res = await create({ parent: '~/code', name: 'Notes' });
    expect(res.status).toBe(201);
    expect((await json(res)).path).toBe(path.join(sb.root, 'code', 'Notes'));
  });

  it('refuses a folder that already exists, touching nothing in it', async () => {
    const parent = await sb.emptyProject('code');
    await mkdir(path.join(parent, 'Taken'));
    const res = await create({ parent, name: 'Taken' });
    expect(res.status).toBe(409);
    expect(await readdir(path.join(parent, 'Taken'))).toEqual([]);
  });

  it.each(['', '  ', '.', '..', 'a/b', 'a\\\\b', 'tab\\there'])(
    'refuses the name %j',
    async (name) => {
      const parent = await sb.emptyProject('code');
      const res = await create({ parent, name });
      expect(res.status).toBe(400);
      expect(await readdir(parent)).toEqual([]);
    },
  );

  it('needs an existing absolute location', async () => {
    expect((await create({ parent: path.join(sb.root, 'nope'), name: 'A' })).status).toBe(404);
    expect((await create({ parent: 'relative/place', name: 'A' })).status).toBe(400);
  });

  it('initialises a git repository when asked', async () => {
    const parent = await sb.emptyProject('code');
    const res = await create({ parent, name: 'WithGit', git: true });
    expect(res.status).toBe(201);
    expect((await stat(path.join(parent, 'WithGit', '.git'))).isDirectory()).toBe(true);
  });

  it('is behind the guard', async () => {
    const parent = await sb.emptyProject('code');
    const res = await sb.call(
      'POST',
      '/api/projects/create',
      { parent, name: 'Evil' },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
    expect(await readdir(parent)).toEqual([]);
  });
});
