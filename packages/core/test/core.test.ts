import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DESIGN_KINDS, parseDesignJson } from '@modelwright/schema';
import { CoreError, RECENTS_LIMIT, createCore, DEMO_TEMPLATE } from '../src';
import { FIXED_NOW, TOOL_PORTS, readDesignText, rejection, useSandbox } from './helpers';

const sb = useSandbox();

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const err = await rejection(promise);
  if (!(err instanceof CoreError)) throw err;
  return err.code;
}

describe('openProject', () => {
  it('summarises an initialised project and adds it to recents', async () => {
    const dir = await sb.notesProject();
    const summary = await sb.core.openProject(dir);
    expect(summary).toMatchObject({
      path: dir,
      displayPath: `~${path.sep}notes`,
      initialised: true,
      lastOpenedAt: FIXED_NOW,
    });
    expect((await sb.core.listRecent()).map((p) => p.path)).toEqual([dir]);
  });

  it('reports a folder without .design as not initialised, named after the folder', async () => {
    const dir = await sb.emptyProject('plain');
    expect(await sb.core.openProject(dir)).toMatchObject({ name: 'plain', initialised: false });
  });

  it('normalises the path', async () => {
    const dir = await sb.notesProject();
    expect((await sb.core.openProject(`${dir}/../notes`)).path).toBe(dir);
  });

  it.each([
    ['a missing folder', () => path.join(sb.root, 'nope'), 'not-found'],
    ['a relative path', () => 'relative/path', 'invalid-argument'],
    ['an empty path', () => '', 'invalid-argument'],
  ])('refuses %s', async (_, makePath, code) => {
    expect(await codeOf(sb.core.openProject(makePath()))).toBe(code);
  });

  it('refuses a file', async () => {
    const file = path.join(sb.root, 'file.txt');
    await writeFile(file, 'x');
    expect(await codeOf(sb.core.openProject(file))).toBe('invalid-argument');
  });
});

describe('initProject', () => {
  it('writes three valid files and the spec, and adds the project to recents', async () => {
    const dir = await sb.emptyProject();
    const summary = await sb.core.initProject(dir, 'Shop');
    expect(summary).toMatchObject({ name: 'Shop', initialised: true });
    expect((await readdir(path.join(dir, '.design'))).sort()).toEqual(
      ['config.json', 'erd.json', 'flows.json', 'spec.md'].sort(),
    );
    for (const kind of DESIGN_KINDS) {
      expect(parseDesignJson(kind, await readDesignText(dir, kind)).ok).toBe(true);
    }
    expect((await sb.core.listRecent())[0]?.name).toBe('Shop');
  });

  it('is a conflict on an initialised project, changing nothing', async () => {
    const dir = await sb.notesProject();
    const before = await readDesignText(dir, 'erd');
    expect(await codeOf(sb.core.initProject(dir))).toBe('conflict');
    expect(await readDesignText(dir, 'erd')).toBe(before);
  });

  it('refuses a symlinked .design', async () => {
    const dir = await sb.emptyProject();
    const elsewhere = await sb.emptyProject('elsewhere');
    await symlink(elsewhere, path.join(dir, '.design'));
    expect(await codeOf(sb.core.initProject(dir))).toBe('conflict');
    expect(await readdir(elsewhere)).toEqual([]);
  });
});

describe('createProject', () => {
  it('creates the folder and its .design/, accepting ~ for home', async () => {
    const summary = await sb.core.createProject('~', 'New One', false);
    expect(summary).toMatchObject({ path: path.join(sb.root, 'New One'), initialised: true });
    expect(await readdir(path.join(sb.root, 'New One'))).toEqual(['.design']);
  });

  it('refuses an existing folder', async () => {
    await sb.emptyProject('taken');
    expect(await codeOf(sb.core.createProject(sb.root, 'taken', false))).toBe('conflict');
  });

  it.each(['', '.', '..', 'a/b'])('refuses the name %j', async (name) => {
    expect(await codeOf(sb.core.createProject(sb.root, name, false))).toBe('invalid-argument');
  });

  it('needs an existing location', async () => {
    expect(await codeOf(sb.core.createProject(path.join(sb.root, 'nope'), 'x', false))).toBe(
      'not-found',
    );
  });

  it('initialises git when asked', async () => {
    const { path: dir } = await sb.core.createProject(sb.root, 'withgit', true);
    expect((await readdir(dir)).sort()).toEqual(['.design', '.git']);
  });
});

describe('recents', () => {
  it('lists most recent first and removes entries', async () => {
    const a = await sb.notesProject('a');
    const b = await sb.notesProject('b');
    await sb.core.openProject(a);
    await sb.core.openProject(b);
    expect((await sb.core.listRecent()).map((p) => p.path)).toEqual([b, a]);
    await sb.core.removeRecent(b);
    expect((await sb.core.listRecent()).map((p) => p.path)).toEqual([a]);
  });

  it(`keeps at most ${RECENTS_LIMIT}`, async () => {
    for (let i = 0; i <= RECENTS_LIMIT; i++)
      await sb.core.openProject(await sb.emptyProject(`p${i}`));
    expect(await sb.core.listRecent()).toHaveLength(RECENTS_LIMIT);
  });

  it('lives in modelwright’s home, not the project', async () => {
    const dir = await sb.notesProject();
    await sb.core.openProject(dir);
    expect(await readdir(sb.home)).toEqual(['recents.json']);
  });
});

describe('readDesign', () => {
  it.each(DESIGN_KINDS)('returns the parsed %s document', async (kind) => {
    const dir = await sb.notesProject();
    const doc = await sb.core.readDesign(dir, kind);
    expect(doc).toEqual(JSON.parse(await readDesignText(dir, kind)));
  });

  it('is not-found for a missing file', async () => {
    const dir = await sb.emptyProject();
    expect(await codeOf(sb.core.readDesign(dir, 'erd'))).toBe('not-found');
  });

  it('is invalid-design, with the issues, for a corrupted file', async () => {
    const dir = await sb.notesProject();
    await writeFile(path.join(dir, '.design', 'erd.json'), '{ "schemaVersion": 1 ');
    const err = await rejection(sb.core.readDesign(dir, 'erd'));
    expect(err).toBeInstanceOf(CoreError);
    expect((err as CoreError).code).toBe('invalid-design');
    expect((err as CoreError).design?.file).toBe('erd');
    expect((err as CoreError).toJSON()).toMatchObject({
      code: 'invalid-design',
      message: 'erd.json is invalid',
    });
  });
});

describe('writeDesign', () => {
  it('writes canonically: a re-save of an untouched file is byte-identical', async () => {
    const dir = await sb.notesProject();
    const before = await readDesignText(dir, 'flows');
    await sb.core.writeDesign(dir, 'flows', await sb.core.readDesign(dir, 'flows'));
    expect(await readDesignText(dir, 'flows')).toBe(before);
  });

  it('regenerates spec.md', async () => {
    const dir = await sb.notesProject();
    const config = await sb.core.readDesign(dir, 'config');
    await sb.core.writeDesign(dir, 'config', { ...config, name: 'Renamed Notes' });
    expect(await readFile(path.join(dir, '.design', 'spec.md'), 'utf8')).toContain('Renamed Notes');
  });

  it('renames the recents entry on a config write', async () => {
    const dir = await sb.notesProject();
    await sb.core.openProject(dir);
    const config = await sb.core.readDesign(dir, 'config');
    await sb.core.writeDesign(dir, 'config', { ...config, name: 'Renamed' });
    expect((await sb.core.listRecent())[0]?.name).toBe('Renamed');
  });

  it('rejects an invalid document and leaves the file untouched', async () => {
    const dir = await sb.notesProject();
    const before = await readDesignText(dir, 'erd');
    expect(await codeOf(sb.core.writeDesign(dir, 'erd', { nonsense: true }))).toBe(
      'invalid-design',
    );
    expect(await readDesignText(dir, 'erd')).toBe(before);
  });

  it('writes only inside an existing .design/', async () => {
    const dir = await sb.emptyProject();
    const erd = await sb.core.readDesign(await sb.notesProject(), 'erd');
    expect(await codeOf(sb.core.writeDesign(dir, 'erd', erd))).toBe('conflict');
    expect(await readdir(dir)).toEqual([]);
  });
});

describe('readBuildRecord', () => {
  it('says there is none when build.json is missing', async () => {
    expect(await sb.core.readBuildRecord(await sb.notesProject())).toEqual({ status: 'none' });
  });

  it('reports an invalid record’s problems', async () => {
    const dir = await sb.notesProject();
    await writeFile(path.join(dir, '.design', 'build.json'), '{}');
    expect((await sb.core.readBuildRecord(dir)).status).toBe('invalid');
  });
});

describe('watchDesign', () => {
  const settle = () => new Promise((r) => setTimeout(r, 300));

  it('reports external edits but not its own writes, and stops on unsubscribe', async () => {
    const dir = await sb.notesProject();
    const seen: string[] = [];
    const stop = await sb.core.watchDesign(dir, (kind) => seen.push(kind));

    const erd = await sb.core.readDesign(dir, 'erd');
    await sb.core.writeDesign(dir, 'erd', { ...erd, layout: {} });
    await settle();
    expect(seen).toEqual([]);

    await writeFile(
      path.join(dir, '.design', 'flows.json'),
      `${await readDesignText(dir, 'flows')} `,
    );
    await settle();
    expect(seen).toEqual(['flows']);

    stop();
    await writeFile(
      path.join(dir, '.design', 'flows.json'),
      (await readDesignText(dir, 'flows')) + '\n',
    );
    await settle();
    expect(seen).toEqual(['flows']);
  });

  it('is a conflict for a folder that isn’t initialised', async () => {
    const dir = await sb.emptyProject();
    expect(await codeOf(sb.core.watchDesign(dir, () => {}))).toBe('conflict');
  });
});

describe('checkPreview', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  async function serve(headers: Record<string, string>): Promise<string> {
    server = createServer((_, res) => res.writeHead(200, headers).end('hello'));
    await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  }

  const toolOrigin = 'http://localhost:4300';

  it('reports a frame-blocking page as refusing embedding when framed', async () => {
    const url = await serve({ 'x-frame-options': 'DENY' });
    expect(await sb.core.checkPreview(url, { toolOrigin })).toEqual({
      status: 'refuses-embedding',
      detail: 'X-Frame-Options: DENY',
    });
  });

  it('ignores frame-blocking headers when the preview isn’t a frame (desktop)', async () => {
    const url = await serve({
      'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'",
    });
    expect(
      await sb.core.checkPreview(url, { toolOrigin: 'app://modelwright', framing: false }),
    ).toEqual({
      status: 'ok',
    });
  });

  it('still refuses the tool’s own ports and reports unreachable servers', async () => {
    const check = (url: string) => sb.core.checkPreview(url, { toolOrigin, framing: false });
    expect((await check(`http://127.0.0.1:${TOOL_PORTS[0]}/`)).status).toBe('invalid');
    expect((await check('http://127.0.0.1:1/')).status).toBe('unreachable');
  });
});

describe('the demo', () => {
  it('is offered once, from the template, at the end of recents', async () => {
    const own = await sb.notesProject();
    const core = createCore({
      homeDir: sb.home,
      userHome: sb.root,
      toolPorts: TOOL_PORTS,
      demoTemplate: DEMO_TEMPLATE,
    });
    await core.openProject(own);
    const list = await core.listRecent();
    expect(list.map((p) => p.demo ?? false)).toEqual([false, true]);
    expect(await readdir(path.join(sb.home, 'demo', 'todo', '.design'))).toContain('spec.md');
  });
});

it('opening a project writes nothing in it', async () => {
  const dir = await sb.notesProject();
  await rm(path.join(dir, '.design', 'spec.md'), { force: true });
  await mkdir(path.join(dir, 'src'));
  const before = await readdir(path.join(dir, '.design'));
  await sb.core.openProject(dir);
  expect((await readdir(dir)).sort()).toEqual(['.design', 'src']);
  expect(await readdir(path.join(dir, '.design'))).toEqual(before);
});
