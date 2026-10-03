import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDesignJson, type DesignKind } from '@modelwright/schema';
import { designPath, json, listDesignDir, readDesignText, useSandbox } from './helpers';

const sb = useSandbox();

describe('POST /api/projects/open', () => {
  it('returns 404 for a missing path', async () => {
    const res = await sb.call('POST', '/api/projects/open', {
      path: path.join(sb.root, 'nope'),
    });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ message: expect.stringMatching(/No folder at/) });
  });

  it('returns 400 for a relative path', async () => {
    const res = await sb.call('POST', '/api/projects/open', { path: 'some/where' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a file rather than a folder', async () => {
    const file = path.join(sb.root, 'file.txt');
    await writeFile(file, 'x');
    const res = await sb.call('POST', '/api/projects/open', { path: file });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing body field', async () => {
    const res = await sb.call('POST', '/api/projects/open', {});
    expect(res.status).toBe(400);
  });

  it('reports a folder without .design as not initialised', async () => {
    const dir = await sb.emptyProject('my-app');
    const res = await sb.call('POST', '/api/projects/open', { path: dir });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ path: dir, name: 'my-app', initialised: false });
  });

  it('reports an initialised project with its config name', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call('POST', '/api/projects/open', { path: dir });
    expect(await json(res)).toEqual({ path: dir, name: 'Notes', initialised: true });
  });

  it('normalises the path', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call('POST', '/api/projects/open', { path: `${dir}/../notes/` });
    expect((await json(res)).path).toBe(dir);
  });

  it('reports a partial .design as not initialised', async () => {
    const dir = await sb.notesProject();
    await rm(designPath(dir, 'flows'));
    const res = await sb.call('POST', '/api/projects/open', { path: dir });
    expect((await json(res)).initialised).toBe(false);
  });

  it('falls back to the folder name when config.json is broken', async () => {
    const dir = await sb.notesProject('broken');
    await writeFile(designPath(dir, 'config'), '{ nope');
    const res = await sb.call('POST', '/api/projects/open', { path: dir });
    expect(await json(res)).toEqual({ path: dir, name: 'broken', initialised: true });
  });
});

describe('POST /api/projects/init', () => {
  it('creates three files that pass the schema', async () => {
    const dir = await sb.emptyProject();
    const res = await sb.call('POST', '/api/projects/init', { path: dir, name: 'Shop' });
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ path: dir, name: 'Shop', initialised: true });
    expect(await listDesignDir(dir)).toEqual(['config.json', 'erd.json', 'flows.json']);

    for (const kind of ['erd', 'flows', 'config'] as DesignKind[]) {
      const result = parseDesignJson(kind, await readDesignText(dir, kind));
      expect(result.ok, `${kind}.json should be valid`).toBe(true);
    }
    expect(JSON.parse(await readDesignText(dir, 'config')).name).toBe('Shop');
  });

  it('names the project after its folder when no name is given', async () => {
    const dir = await sb.emptyProject('recipe-box');
    const res = await sb.call('POST', '/api/projects/init', { path: dir, name: '  ' });
    expect((await json(res)).name).toBe('recipe-box');
  });

  it('returns 409 on an already-initialised project and changes nothing', async () => {
    const dir = await sb.notesProject();
    const before = await readDesignText(dir, 'erd');
    const res = await sb.call('POST', '/api/projects/init', { path: dir, name: 'Other' });
    expect(res.status).toBe(409);
    expect(await readDesignText(dir, 'erd')).toBe(before);
    expect(JSON.parse(await readDesignText(dir, 'config')).name).toBe('Notes');
  });

  it('fills in only the missing files of a partial .design', async () => {
    const dir = await sb.notesProject();
    await rm(designPath(dir, 'flows'));
    const erdBefore = await readDesignText(dir, 'erd');

    const res = await sb.call('POST', '/api/projects/init', { path: dir });
    expect(res.status).toBe(201);
    expect(await readDesignText(dir, 'erd')).toBe(erdBefore);
    expect(JSON.parse(await readDesignText(dir, 'flows')).screens).toEqual([]);
    expect((await json(res)).name).toBe('Notes');
  });

  it('refuses when .design is a file', async () => {
    const dir = await sb.emptyProject();
    await writeFile(path.join(dir, '.design'), 'not a folder');
    const res = await sb.call('POST', '/api/projects/init', { path: dir });
    expect(res.status).toBe(409);
  });

  it('refuses when .design is a symlink to somewhere else', async () => {
    const dir = await sb.emptyProject();
    const elsewhere = path.join(sb.root, 'elsewhere');
    await mkdir(elsewhere);
    await symlink(elsewhere, path.join(dir, '.design'));
    const res = await sb.call('POST', '/api/projects/init', { path: dir });
    expect(res.status).toBe(409);
    expect(await listDesignDir(dir)).toEqual([]);
  });
});

describe('recents', () => {
  const open = (dir: string) => sb.call('POST', '/api/projects/open', { path: dir });
  const recent = async () =>
    (await json(await sb.call('GET', '/api/projects/recent'))) as {
      path: string;
      name: string;
      initialised: boolean;
    }[];

  it('starts empty', async () => {
    expect(await recent()).toEqual([]);
  });

  it('adds opened projects, most recent first', async () => {
    const a = await sb.emptyProject('a');
    const b = await sb.notesProject('b');
    await open(a);
    await open(b);
    expect(await recent()).toEqual([
      { path: b, name: 'Notes', initialised: true },
      { path: a, name: 'a', initialised: false },
    ]);
  });

  it('dedupes by path and moves a reopened project to the top', async () => {
    const a = await sb.emptyProject('a');
    const b = await sb.emptyProject('b');
    await open(a);
    await open(b);
    await open(a);
    expect((await recent()).map((r) => r.path)).toEqual([a, b]);
  });

  it('adds initialised projects with their new name', async () => {
    const dir = await sb.emptyProject();
    await sb.call('POST', '/api/projects/init', { path: dir, name: 'Fresh' });
    expect(await recent()).toEqual([{ path: dir, name: 'Fresh', initialised: true }]);
  });

  it('removes an entry', async () => {
    const a = await sb.emptyProject('a');
    const b = await sb.emptyProject('b');
    await open(a);
    await open(b);
    const res = await sb.call('DELETE', '/api/projects/recent', { path: a });
    expect(res.status).toBe(204);
    expect((await recent()).map((r) => r.path)).toEqual([b]);
  });

  it('caps the list at 20', async () => {
    const dirs: string[] = [];
    for (let i = 0; i < 22; i++) dirs.push(await sb.emptyProject(`p${i}`));
    for (const dir of dirs) await open(dir);
    const list = await recent();
    expect(list).toHaveLength(20);
    expect(list[0]?.path).toBe(dirs[21]);
    expect(list.map((r) => r.path)).not.toContain(dirs[0]);
  });

  it('stores recents in the home directory, not the project', async () => {
    const dir = await sb.emptyProject();
    await open(dir);
    const stored = JSON.parse(await readFile(path.join(sb.home, 'recents.json'), 'utf8'));
    expect(stored.projects).toEqual([{ path: dir, name: 'empty' }]);
  });

  it('treats a corrupt recents file as empty', async () => {
    await mkdir(sb.home, { recursive: true });
    await writeFile(path.join(sb.home, 'recents.json'), '[[[');
    expect(await recent()).toEqual([]);
    const dir = await sb.emptyProject();
    await open(dir);
    expect(await recent()).toHaveLength(1);
  });

  it('keeps concurrent opens', async () => {
    const dirs = await Promise.all(['a', 'b', 'c', 'd'].map((n) => sb.emptyProject(n)));
    await Promise.all(dirs.map(open));
    expect((await recent()).map((r) => r.path).sort()).toEqual([...dirs].sort());
  });

  it('reports a project whose folder has gone as not initialised', async () => {
    const dir = await sb.notesProject();
    await open(dir);
    await rm(dir, { recursive: true });
    expect(await recent()).toEqual([{ path: dir, name: 'Notes', initialised: false }]);
  });
});
