import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBuildRecordJson } from '@modelwright/schema';
import { createApp } from '../../../apps/server/src/app';
import { BUNDLE_PATH, buildBundle } from '../scripts/build';
import { main } from '../src/main';

const NOTES = fileURLToPath(new URL('../../schema/test/fixtures/notes', import.meta.url));
const EDITED = fileURLToPath(new URL('../../spec/test/fixtures/notes-edited', import.meta.url));
const NOW = new Date('2026-10-06T09:30:00.000Z');

let root: string;
let project: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'modelwright-cli-'));
  project = path.join(root, 'notes');
  await mkdir(project);
  await cp(NOTES, path.join(project, '.design'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs the CLI in-process, from `cwd` (default: the project). */
async function run(args: string[], cwd = project) {
  let stdout = '';
  let stderr = '';
  const code = await main(args, {
    cwd,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    now: () => NOW,
  });
  return { code, stdout, stderr };
}

const designPath = (name: string) => path.join(project, '.design', name);
const readDesign = (name: string) => readFile(designPath(name), 'utf8');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests edit files into any shape
async function editDesign(name: string, edit: (doc: any) => void) {
  const doc = JSON.parse(await readDesign(name));
  edit(doc);
  await writeFile(designPath(name), `${JSON.stringify(doc, null, 2)}\n`);
}

/** Every file in `.design/` with a hash of its contents, to prove what was (not) written. */
async function snapshotDir(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of (await readdir(path.join(project, '.design'))).sort()) {
    out[name] = createHash('sha256')
      .update(await readFile(designPath(name)))
      .digest('hex');
  }
  return out;
}

/** Copies the edited notes design over the project's erd.json, flows.json and config.json. */
async function applyEdited() {
  for (const name of ['erd.json', 'flows.json', 'config.json']) {
    await cp(path.join(EDITED, name), designPath(name));
  }
}

describe('usage', () => {
  it('prints help', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage: modelwright-design');
  });

  it('exits 2 for no command, an unknown one, or a misplaced option', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['build'])).code).toBe(2);
    expect((await run(['status', '--map', 'x.json'])).code).toBe(2);
    expect((await run(['status', '--nope'])).code).toBe(2);
  });

  it('fails without a .design/ folder, and refuses a symlinked one', async () => {
    const empty = path.join(root, 'empty');
    await mkdir(empty);
    const r = await run(['status', empty]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('No .design/ folder');

    const linked = path.join(root, 'linked');
    await mkdir(linked);
    await symlink(path.join(project, '.design'), path.join(linked, '.design'));
    expect((await run(['spec', linked])).stderr).toContain("isn't a real folder");
  });

  it('takes the project directory as an argument, relative to the working directory', async () => {
    const r = await run(['status', 'notes'], root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No build yet\n');
  });
});

describe('validate', () => {
  it('passes the notes design', async () => {
    const r = await run(['validate']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'config.json: valid\nerd.json: valid\nflows.json: valid\nbuild.json: none yet\nThe design is valid.\n',
    );
  });

  it('fails with the path of a stray key', async () => {
    await editDesign('erd.json', (erd) => (erd.entities[0].attributes[0].type = 'string'));
    const r = await run(['validate']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(
      'erd.json: 1 problem\n  entities › 0 › attributes › 0 › type: Unknown key "type"',
    );
    expect(r.stdout).toContain('The design has problems.');
  });

  it('checks build.json too, and reports in JSON', async () => {
    await writeFile(designPath('build.json'), '{"schemaVersion": 1}\n');
    const r = await run(['validate', '--json']);
    expect(r.code).toBe(1);
    const report = JSON.parse(r.stdout);
    expect(report.ok).toBe(false);
    expect(report.files.find((f: { file: string }) => f.file === 'build.json').status).toBe(
      'invalid',
    );
  });

  it('reports a missing file', async () => {
    await rm(designPath('flows.json'));
    const r = await run(['validate']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('flows.json: missing');
  });
});

describe('spec', () => {
  it('writes spec.md, then reports it up to date', async () => {
    const first = await run(['spec']);
    expect(first).toMatchObject({ code: 0, stdout: 'Wrote .design/spec.md.\n' });
    expect((await run(['spec'])).stdout).toBe('.design/spec.md is already up to date.\n');
  });

  it('matches the server’s spec.md byte for byte', async () => {
    await applyEdited();
    await run(['spec']);
    const fromCli = await readDesign('spec.md');

    // The server writes spec.md after a PUT; give it the same design in a second project.
    const other = path.join(root, 'server');
    await mkdir(other);
    await cp(path.join(project, '.design'), path.join(other, '.design'), { recursive: true });
    await rm(path.join(other, '.design', 'spec.md'));
    const app = createApp({ homeDir: path.join(root, 'home'), userHome: root });
    const res = await app.request(`/api/design/erd?path=${encodeURIComponent(other)}`, {
      method: 'PUT',
      headers: { host: '127.0.0.1:4301', 'content-type': 'application/json' },
      body: await readDesign('erd.json'),
    });
    expect(res.status).toBe(204);
    expect(await readFile(path.join(other, '.design', 'spec.md'), 'utf8')).toBe(fromCli);
  });

  it('writes nothing when the design is invalid', async () => {
    await editDesign('flows.json', (flows) => (flows.screens[0].extra = true));
    const before = await snapshotDir();
    const r = await run(['spec']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('flows.json: screens › 0 › extra: Unknown key "extra"');
    expect(await snapshotDir()).toEqual(before);
  });
});

describe('status and diff', () => {
  it('says there is no build yet', async () => {
    expect((await run(['status'])).stdout).toBe('No build yet\n');
    expect((await run(['diff'])).stdout).toBe('No build yet — this is a first build.\n');
    expect(JSON.parse((await run(['diff', '--json'])).stdout)).toEqual({
      ok: true,
      firstBuild: true,
    });
  });

  it('is up to date right after a build, and counts changes after edits', async () => {
    await run(['record-build']);
    expect((await run(['status'])).stdout).toBe(
      'Up to date with the build of 2026-10-06 09:30 UTC\n',
    );

    await editDesign('erd.json', (erd) => {
      erd.entities[1].name = 'Memo';
      erd.layout.note.x = 9999; // moving a card is not a change
    });
    expect((await run(['status'])).stdout).toBe(
      '1 change since the build of 2026-10-06 09:30 UTC\n',
    );
    const diff = await run(['diff']);
    expect(diff.stdout).toBe(
      '1 change since the build of 2026-10-06 09:30 UTC.\n\n### Data model\n\n- Renamed entity “Note” to “Memo”.\n',
    );
    const json = JSON.parse((await run(['status', '--json'])).stdout);
    expect(json).toMatchObject({ status: 'changed', changes: 1, builtAt: NOW.toISOString() });
  });

  it('diffs against a snapshot file with --from', async () => {
    const base = path.join(root, 'base.json');
    const doc = async (name: string) => JSON.parse(await readFile(path.join(NOTES, name), 'utf8'));
    await writeFile(
      base,
      JSON.stringify({
        config: await doc('config.json'),
        erd: await doc('erd.json'),
        flows: await doc('flows.json'),
      }),
    );
    await applyEdited();
    const r = await run(['diff', '--from', base, '--json']);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.changes).toBeGreaterThan(20);
    expect(out.diff.config.map((c: { kind: string }) => c.kind)).toEqual([
      'project-renamed',
      'preview-url-changed',
    ]);
  });

  it('fails on an invalid build.json or design', async () => {
    await writeFile(designPath('build.json'), 'nope');
    expect((await run(['status'])).code).toBe(1);
    await rm(designPath('build.json'));
    await editDesign('config.json', (c) => (c.name = ''));
    const r = await run(['diff']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.json: name: Project name must not be empty');
  });
});

describe('record-build', () => {
  const writeMap = async (map: unknown) => {
    const file = path.join(root, 'map.json');
    await writeFile(file, JSON.stringify(map));
    return file;
  };

  it('writes a valid build.json with the design as its snapshot', async () => {
    const map = await writeMap({
      entities: { note: ['src/db.ts#notes'] },
      screens: { login: ['src/routes/login.tsx'] },
      states: { notes: { 'notes-empty': ['src/routes/notes.tsx#Empty'] } },
    });
    const r = await run(['record-build', '--map', map]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Mapped 1 entity, 1 screen and 1 state.');
    const parsed = parseBuildRecordJson(await readDesign('build.json'));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(parsed.record.builtAt).toBe(NOW.toISOString());
    expect(parsed.record.snapshot.erd).toEqual(JSON.parse(await readDesign('erd.json')));
    expect(parsed.record.map?.states).toEqual({
      notes: { 'notes-empty': ['src/routes/notes.tsx#Empty'] },
    });
  });

  it('merges the new map over the old one and drops ids that are gone', async () => {
    await run([
      'record-build',
      '--map',
      await writeMap({
        entities: { user: ['src/db.ts#users'], note: ['src/db.ts#notes'] },
        screens: { login: ['login.tsx'], editor: ['editor.tsx'] },
        states: { notes: { 'notes-list': ['notes.tsx#List'], 'notes-empty': ['notes.tsx#Empty'] } },
      }),
    ]);

    // Remove the Note editor screen and the Empty state, then record a build that maps only one entity anew.
    await editDesign('flows.json', (flows) => {
      flows.screens = flows.screens.filter((s: { id: string }) => s.id !== 'editor');
      flows.screens[1].states = flows.screens[1].states.filter(
        (s: { id: string }) => s.id !== 'notes-empty',
      );
      flows.transitions = flows.transitions.filter(
        (t: { from: { screenId: string; stateId: string }; to: { screenId: string } }) =>
          t.from.screenId !== 'editor' &&
          t.to.screenId !== 'editor' &&
          t.from.stateId !== 'notes-empty',
      );
      delete flows.layout.editor;
    });
    const r = await run([
      'record-build',
      '--map',
      await writeMap({ entities: { note: ['src/models/note.ts'] } }),
    ]);
    expect(r.code).toBe(0);
    const record = JSON.parse(await readDesign('build.json'));
    expect(record.map).toEqual({
      entities: { user: ['src/db.ts#users'], note: ['src/models/note.ts'] },
      screens: { login: ['login.tsx'] },
      states: { notes: { 'notes-list': ['notes.tsx#List'] } },
    });
  });

  it('refuses an invalid map file, an invalid previous record, or an invalid design, writing nothing', async () => {
    const before = await snapshotDir();
    const bad = await run([
      'record-build',
      '--map',
      await writeMap({ entities: { note: 'src/db.ts' } }),
    ]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("map.json isn't a valid build map.");
    expect(await snapshotDir()).toEqual(before);

    await editDesign('erd.json', (erd) => (erd.entities[0].attributes[0].type = 'string'));
    const invalidDesign = await snapshotDir();
    expect((await run(['record-build'])).code).toBe(1);
    expect(await snapshotDir()).toEqual(invalidDesign);
  });

  it('is byte-identical when recorded twice at the same time', async () => {
    await run(['record-build']);
    const first = await readDesign('build.json');
    await run(['record-build']);
    expect(await readDesign('build.json')).toBe(first);
  });
});

describe('set-preview', () => {
  it('applies the UI’s URL rules and writes canonical config.json, then the spec', async () => {
    const r = await run(['set-preview', '--url', 'localhost:3000', '--dev-command', 'pnpm dev']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('Set the preview to http://localhost:3000 (dev command: pnpm dev).\n');
    expect(JSON.parse(await readDesign('config.json')).preview).toEqual({
      url: 'http://localhost:3000',
      devCommand: 'pnpm dev',
    });
    expect(await readDesign('config.json')).toBe(
      '{\n  "schemaVersion": 1,\n  "name": "Notes",\n  "preview": {\n    "url": "http://localhost:3000",\n    "devCommand": "pnpm dev"\n  }\n}\n',
    );
    expect(await readDesign('spec.md')).toContain('- URL: http://localhost:3000');
    expect((await run(['set-preview', '--url', 'http://localhost:3000'])).stdout).toBe(
      'The preview is already http://localhost:3000 (dev command: pnpm dev).\n',
    );
  });

  it('refuses modelwright’s own address and non-http URLs, writing nothing', async () => {
    const before = await snapshotDir();
    const own = await run(['set-preview', '--url', 'http://127.0.0.1:4300']);
    expect(own.code).toBe(1);
    expect(own.stderr).toContain('That’s modelwright’s own address');
    const ftp = await run(['set-preview', '--url', 'ftp://example.com']);
    expect(ftp.stderr).toContain('Only http:// and https:// addresses can be previewed.');
    expect((await run(['set-preview'])).code).toBe(2);
    expect(await snapshotDir()).toEqual(before);
  });
});

describe('what the CLI writes', () => {
  it('never writes erd.json or flows.json, whatever it runs', async () => {
    const hash = async () => ({
      erd: (await snapshotDir())['erd.json'],
      flows: (await snapshotDir())['flows.json'],
    });
    const before = await hash();
    for (const args of [
      ['validate'],
      ['spec'],
      ['status'],
      ['diff'],
      ['record-build'],
      ['set-preview', '--url', 'localhost:5174', '--dev-command', 'npm run dev'],
      ['diff', '--json'],
    ]) {
      await run(args);
    }
    expect(await hash()).toEqual(before);
    expect(Object.keys(await snapshotDir()).sort()).toEqual([
      'build.json',
      'config.json',
      'erd.json',
      'flows.json',
      'spec.md',
    ]);
  });
});

describe('the bundled bin', () => {
  it('is committed exactly as a fresh build makes it', async () => {
    const committed = await readFile(BUNDLE_PATH, 'utf8').catch(() => '');
    expect(
      committed === (await buildBundle()),
      'Run `pnpm build:plugin` and commit the result',
    ).toBe(true);
  });

  it('is executable', async () => {
    expect((await stat(BUNDLE_PATH)).mode & 0o111).toBe(0o111);
  });

  it('runs under node', async () => {
    const { stdout } = await promisify(execFile)(BUNDLE_PATH, ['status', project]);
    expect(stdout).toBe('No build yet\n');
  });
});
