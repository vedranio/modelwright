import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stringifyErd, type Erd } from '@modelwright/schema';
import { designFile } from '@modelwright/project/node';
import { designUrl, json, listDesignDir, readDesignText, useSandbox } from './helpers';

const sb = useSandbox();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/design/:file', () => {
  it('returns the parsed document', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call('GET', designUrl('erd', dir));
    expect(res.status).toBe(200);
    const erd = (await json(res)) as Erd;
    expect(erd.entities.map((e) => e.name)).toEqual(['User', 'Note']);
  });

  it.each(['erd', 'flows', 'config'])('reads %s.json', async (kind) => {
    const dir = await sb.notesProject();
    const res = await sb.call('GET', designUrl(kind, dir));
    expect(await json(res)).toEqual(JSON.parse(await readDesignText(dir, kind)));
  });

  it('returns 422 with issue paths for a hand-corrupted file', async () => {
    const dir = await sb.notesProject();
    const erd = JSON.parse(await readDesignText(dir, 'erd'));
    erd.relationships[0].to = 'ghost';
    await fs.writeFile(path.join(dir, '.design', 'erd.json'), JSON.stringify(erd));

    const res = await sb.call('GET', designUrl('erd', dir));
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      file: 'erd',
      issues: [
        {
          path: ['relationships', 0, 'to'],
          message: 'Relationship "user-notes" points at unknown entity "ghost"',
        },
      ],
    });
  });

  it('returns 422 at the root for invalid JSON', async () => {
    const dir = await sb.notesProject();
    await fs.writeFile(path.join(dir, '.design', 'flows.json'), '{ "schemaVersion": 1,');
    const res = await sb.call('GET', designUrl('flows', dir));
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.file).toBe('flows');
    expect(body.issues[0].path).toEqual([]);
    expect(body.issues[0].message).toMatch(/Invalid JSON/);
  });

  it('returns 404 when the file is missing', async () => {
    const dir = await sb.emptyProject();
    const res = await sb.call('GET', designUrl('erd', dir));
    expect(res.status).toBe(404);
  });

  it('returns 400 for an unknown file kind', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call('GET', designUrl('package', dir));
    expect(res.status).toBe(400);
  });

  it('returns 400 without a project path', async () => {
    const res = await sb.call('GET', '/api/design/erd');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/design/:file', () => {
  async function editedErd(dir: string): Promise<Erd> {
    const erd = JSON.parse(await readDesignText(dir, 'erd')) as Erd;
    erd.entities.push({ id: 'tag', name: 'Tag', attributes: [] });
    return erd;
  }

  it('validates and writes the document', async () => {
    const dir = await sb.notesProject();
    const erd = await editedErd(dir);
    const res = await sb.call('PUT', designUrl('erd', dir), erd);
    expect(res.status).toBe(204);
    expect(await readDesignText(dir, 'erd')).toBe(stringifyErd(erd));

    const reread = await sb.call('GET', designUrl('erd', dir));
    expect(((await json(reread)) as Erd).entities.map((e) => e.name)).toContain('Tag');
  });

  it('re-saving an untouched document leaves the file byte-identical', async () => {
    const dir = await sb.notesProject();
    for (const kind of ['erd', 'flows', 'config']) {
      const before = await readDesignText(dir, kind);
      const doc = await json(await sb.call('GET', designUrl(kind, dir)));
      await sb.call('PUT', designUrl(kind, dir), doc);
      expect(await readDesignText(dir, kind)).toBe(before);
    }
  });

  it('rejects an invalid document with 422 and leaves the file untouched', async () => {
    const dir = await sb.notesProject();
    const before = await readDesignText(dir, 'erd');
    const erd = await editedErd(dir);
    erd.relationships[0] = {
      ...erd.relationships[0],
      from: 'ghost',
    } as Erd['relationships'][number];

    const res = await sb.call('PUT', designUrl('erd', dir), erd);
    expect(res.status).toBe(422);
    expect((await json(res)).issues[0].path).toEqual(['relationships', 0, 'from']);
    expect(await readDesignText(dir, 'erd')).toBe(before);
  });

  it('is atomic: a failed write leaves the original intact and no temp file behind', async () => {
    const dir = await sb.notesProject();
    const before = await readDesignText(dir, 'erd');
    const listing = await listDesignDir(dir);
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk full'));

    const res = await sb.call('PUT', designUrl('erd', dir), await editedErd(dir));
    expect(res.status).toBe(500);
    expect(await readDesignText(dir, 'erd')).toBe(before);
    expect(await listDesignDir(dir)).toEqual(listing);
  });

  it('rejects a file kind that would escape .design', async () => {
    const dir = await sb.notesProject();
    const escape = encodeURIComponent('../package');
    const res = await sb.call('PUT', `/api/design/${escape}?path=${encodeURIComponent(dir)}`, {
      name: 'pwned',
    });
    expect(res.status).toBe(400);
    await expect(fs.stat(path.join(dir, 'package.json'))).rejects.toThrow();
  });

  it('builds paths only directly inside .design', () => {
    expect(designFile('/p', 'erd')).toBe(path.join('/p', '.design', 'erd.json'));
    // Defence in depth: even a bad kind that slipped past the type can't escape.
    expect(() => designFile('/p', '../x' as never)).toThrow(/outside/);
  });

  it('refuses to write into a project that is not initialised', async () => {
    const dir = await sb.emptyProject();
    const res = await sb.call('PUT', designUrl('config', dir), {
      schemaVersion: 1,
      name: 'X',
      preview: {},
    });
    expect(res.status).toBe(409);
    await expect(fs.stat(path.join(dir, '.design'))).rejects.toThrow();
  });

  it('refuses to write through a symlinked .design', async () => {
    const dir = await sb.emptyProject();
    const elsewhere = path.join(sb.root, 'elsewhere');
    await fs.mkdir(elsewhere);
    await fs.symlink(elsewhere, path.join(dir, '.design'));
    const res = await sb.call('PUT', designUrl('config', dir), {
      schemaVersion: 1,
      name: 'X',
      preview: {},
    });
    expect(res.status).toBe(409);
    expect(await fs.readdir(elsewhere)).toEqual([]);
  });

  it('returns 415 for a non-JSON body', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call('PUT', designUrl('erd', dir), 'x', { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
  });

  it('returns 400 for malformed JSON', async () => {
    const dir = await sb.notesProject();
    const res = await sb.call('PUT', designUrl('erd', dir), '{ nope');
    expect(res.status).toBe(400);
  });

  it('renaming the project in config.json updates recents', async () => {
    const dir = await sb.notesProject();
    await sb.call('POST', '/api/projects/open', { path: dir });
    const config = await json(await sb.call('GET', designUrl('config', dir)));
    await sb.call('PUT', designUrl('config', dir), { ...config, name: 'Notebook' });

    const recent = await json(await sb.call('GET', '/api/projects/recent'));
    expect(recent[0].name).toBe('Notebook');
    expect(await readDesignText(dir, 'config')).toBe(
      '{\n  "schemaVersion": 1,\n  "name": "Notebook",\n  "preview": {\n    "url": "http://localhost:5173"\n  }\n}\n',
    );
  });
});
