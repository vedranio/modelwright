import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSpec } from '@modelwright/spec';
import { parseDesignJson, type Config, type Erd, type Flows } from '@modelwright/schema';
import { designPath, designUrl, listDesignDir, readDesignText, useSandbox } from './helpers';

const sb = useSandbox();
const specPath = (dir: string) => path.join(dir, '.design', 'spec.md');
const readSpec = (dir: string) => readFile(specPath(dir), 'utf8');

async function expected(dir: string): Promise<string> {
  const doc = async (kind: 'config' | 'erd' | 'flows') => {
    const result = parseDesignJson(kind, await readDesignText(dir, kind));
    if (!result.ok) throw new Error(kind);
    return result.doc;
  };
  return renderSpec(
    (await doc('config')) as Config,
    (await doc('erd')) as Erd,
    (await doc('flows')) as Flows,
  );
}

async function renameUser(dir: string, name: string) {
  const erd = JSON.parse(await readDesignText(dir, 'erd'));
  erd.entities[0].name = name;
  return sb.call('PUT', designUrl('erd', dir), erd);
}

describe('.design/spec.md', () => {
  it('is regenerated after a valid PUT of any design file', async () => {
    const dir = await sb.notesProject();
    expect(await renameUser(dir, 'Person')).toHaveProperty('status', 204);
    const spec = await readSpec(dir);
    expect(spec).toBe(await expected(dir));
    expect(spec).toContain('Each Person owns zero or more Notes.');

    const config = JSON.parse(await readDesignText(dir, 'config'));
    config.name = 'Renamed';
    await sb.call('PUT', designUrl('config', dir), config);
    expect(await readSpec(dir)).toContain('# Renamed');
  });

  it('is never written on open or on a read', async () => {
    const dir = await sb.notesProject();
    await sb.call('POST', '/api/projects/open', { path: dir });
    await sb.call('GET', designUrl('erd', dir));
    expect(await listDesignDir(dir)).not.toContain('spec.md');
  });

  it('is left alone when any design file is invalid', async () => {
    const dir = await sb.notesProject();
    await renameUser(dir, 'Person');
    const before = await readSpec(dir);
    // flows.json broken by hand; a valid erd.json save mustn't touch the spec.
    await writeFile(designPath(dir, 'flows'), '{ "schemaVersion": 1, "screens": "nope" }');
    expect(await renameUser(dir, 'Someone')).toHaveProperty('status', 204);
    expect(await readSpec(dir)).toBe(before);
  });

  it('is left alone when the PUT itself is refused', async () => {
    const dir = await sb.notesProject();
    await renameUser(dir, 'Person');
    const before = await readSpec(dir);
    const res = await sb.call('PUT', designUrl('erd', dir), { schemaVersion: 1, entities: 'no' });
    expect(res.status).toBe(422);
    expect(await readSpec(dir)).toBe(before);
  });

  it("isn't rewritten when its text hasn't changed", async () => {
    const dir = await sb.notesProject();
    await renameUser(dir, 'Person');
    const before = await stat(specPath(dir));
    await new Promise((r) => setTimeout(r, 20));
    await renameUser(dir, 'Person');
    expect((await stat(specPath(dir))).mtimeMs).toBe(before.mtimeMs);
  });

  it('still refuses writes to anything but the design files', async () => {
    const dir = await sb.notesProject();
    for (const file of ['spec', 'spec.md', '..%2Fevil', 'notes']) {
      const res = await sb.call('PUT', designUrl(file, dir), { any: 1 });
      expect(res.status, file).toBe(400);
    }
    expect(await listDesignDir(dir)).toEqual(['config.json', 'erd.json', 'flows.json']);
  });
});
