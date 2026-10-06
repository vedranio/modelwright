import { describe, expect, it } from 'vitest';
import {
  parseBuildRecord,
  parseBuildRecordJson,
  stringifyBuildRecord,
  type BuildRecord,
  type BuildRecordResult,
} from '../src/index';
import { fixture } from './helpers';

/** A valid record over the notes fixture, as plain JSON that tests may mutate. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate records into invalid shapes
function record(): any {
  return {
    schemaVersion: 1,
    builtAt: '2026-10-06T09:30:00.000Z',
    snapshot: { config: fixture('config'), erd: fixture('erd'), flows: fixture('flows') },
    map: {
      entities: { user: ['src/db/schema.ts#users'], note: ['src/db/schema.ts#notes'] },
      screens: { login: ['src/routes/login.tsx'] },
      states: { notes: { 'notes-empty': ['src/routes/notes.tsx#EmptyState'] } },
    },
  };
}

function ok(result: BuildRecordResult): BuildRecord {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.record;
}

function issuePaths(result: BuildRecordResult): string[] {
  if (result.ok) throw new Error('Expected parse to fail');
  return result.issues.map((i) => JSON.stringify(i.path));
}

describe('BuildRecord', () => {
  it('parses a valid record', () => {
    expect(ok(parseBuildRecord(record())).map?.screens).toEqual({
      login: ['src/routes/login.tsx'],
    });
  });

  it('parses a record without a map', () => {
    const r = record();
    delete r.map;
    expect(ok(parseBuildRecord(r)).map).toBeUndefined();
  });

  it('reports problems in the snapshot with paths into it', () => {
    const r = record();
    r.snapshot.erd.entities[0].attributes[0].type = 'string';
    r.snapshot.flows.transitions[0].to.screenId = 'nowhere';
    const paths = issuePaths(parseBuildRecord(r));
    expect(paths).toContain(
      JSON.stringify(['snapshot', 'erd', 'entities', 0, 'attributes', 0, 'type']),
    );
  });

  it('reports cross-reference problems inside the snapshot', () => {
    const r = record();
    r.snapshot.flows.transitions[0].to.screenId = 'nowhere';
    expect(issuePaths(parseBuildRecord(r))).toContain(
      JSON.stringify(['snapshot', 'flows', 'transitions', 0, 'to', 'screenId']),
    );
  });

  it('rejects unknown keys at every level', () => {
    const r = record();
    r.extra = true;
    r.map.extra = true;
    const paths = issuePaths(parseBuildRecord(r));
    expect(paths).toContain(JSON.stringify(['extra']));
    expect(paths).toContain(JSON.stringify(['map', 'extra']));
  });

  it('rejects a missing snapshot file and a bad timestamp', () => {
    const r = record();
    delete r.snapshot.flows;
    r.builtAt = 'yesterday';
    const paths = issuePaths(parseBuildRecord(r));
    expect(paths).toContain(JSON.stringify(['snapshot', 'flows']));
    expect(paths).toContain(JSON.stringify(['builtAt']));
  });

  it('rejects map entries for ids the snapshot does not have', () => {
    const r = record();
    r.map.entities.ghost = ['x.ts'];
    r.map.states.notes.ghost = ['x.ts'];
    r.map.states.nowhere = { a: ['x.ts'] };
    const paths = issuePaths(parseBuildRecord(r));
    expect(paths).toContain(JSON.stringify(['map', 'entities', 'ghost']));
    expect(paths).toContain(JSON.stringify(['map', 'states', 'notes', 'ghost']));
    expect(paths).toContain(JSON.stringify(['map', 'states', 'nowhere']));
  });

  it('rejects empty code references', () => {
    const r = record();
    r.map.screens.login = [''];
    expect(issuePaths(parseBuildRecord(r))).toContain(
      JSON.stringify(['map', 'screens', 'login', 0]),
    );
  });

  it('refuses a newer schemaVersion with a clear message', () => {
    const r = record();
    r.schemaVersion = 2;
    const result = parseBuildRecord(r);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/newer modelwright/);
  });

  it('reports invalid JSON at the root', () => {
    const result = parseBuildRecordJson('{ nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toEqual([]);
  });
});

describe('stringifyBuildRecord', () => {
  it('is canonical whatever order keys arrive in', () => {
    const r = ok(parseBuildRecord(record()));
    const text = stringifyBuildRecord(r);

    const scrambled = record();
    scrambled.map = {
      states: scrambled.map.states,
      screens: scrambled.map.screens,
      entities: { note: scrambled.map.entities.note, user: scrambled.map.entities.user },
    };
    scrambled.snapshot.erd.layout = {
      note: scrambled.snapshot.erd.layout.note,
      user: scrambled.snapshot.erd.layout.user,
    };
    const reordered = {
      map: scrambled.map,
      snapshot: {
        flows: scrambled.snapshot.flows,
        erd: scrambled.snapshot.erd,
        config: scrambled.snapshot.config,
      },
      builtAt: scrambled.builtAt,
      schemaVersion: 1,
    };
    expect(stringifyBuildRecord(ok(parseBuildRecord(reordered)))).toBe(text);
  });

  it('round-trips byte for byte', () => {
    const text = stringifyBuildRecord(ok(parseBuildRecord(record())));
    expect(stringifyBuildRecord(ok(parseBuildRecordJson(text)))).toBe(text);
    expect(text.startsWith('{\n  "schemaVersion": 1,\n  "builtAt"')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('writes map keys in design order', () => {
    const text = stringifyBuildRecord(ok(parseBuildRecord(record())));
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed.map.entities)).toEqual(['user', 'note']);
  });
});
