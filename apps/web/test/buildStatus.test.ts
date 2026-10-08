import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDesignJson, type BuildRead, type DesignKind } from '@modelwright/schema';
import type { Design } from '@modelwright/spec';
import { buildStatus, builtAgo } from '../src/buildRecord/status';
import { must } from './helpers';

const NOTES = fileURLToPath(
  new URL('../../../packages/schema/test/fixtures/notes', import.meta.url),
);

function notes(): Design {
  const read = <K extends DesignKind>(kind: K) => {
    const result = parseDesignJson(kind, readFileSync(`${NOTES}/${kind}.json`, 'utf8'));
    if (!result.ok) throw new Error(kind);
    return result.doc;
  };
  return { config: read('config'), erd: read('erd'), flows: read('flows') } as Design;
}

const BUILT_AT = '2026-10-06T09:00:00.000Z';
const at = (iso: string) => new Date(iso);
const built = (snapshot: Design = notes()): BuildRead => ({
  status: 'ok',
  record: { schemaVersion: 1, builtAt: BUILT_AT, snapshot },
});

describe('buildStatus', () => {
  const now = at('2026-10-06T09:12:00.000Z');

  it('waits for the build record, and for the design', () => {
    expect(buildStatus(null, notes(), false, now)).toEqual({ kind: 'loading' });
    expect(buildStatus(built(), null, true, now)).toEqual({ kind: 'loading' });
  });

  it('says "Not built yet" with no build record', () => {
    expect(buildStatus({ status: 'none' }, notes(), false, now)).toEqual({
      kind: 'none',
      text: 'Not built yet',
    });
  });

  it('says when it was built when the design matches the snapshot', () => {
    expect(buildStatus(built(), notes(), false, now)).toEqual({
      kind: 'up-to-date',
      text: 'Built 12 minutes ago',
      builtAt: BUILT_AT,
    });
  });

  it('ignores moved cards', () => {
    const design = notes();
    design.erd.layout = { user: { x: 500, y: 500 } };
    expect(buildStatus(built(), design, false, now).kind).toBe('up-to-date');
  });

  it('counts the changes since the build, renames as renames', () => {
    const design = notes();
    must(design.erd.entities[1]).name = 'Memo';
    const status = buildStatus(built(), design, false, now);
    expect(status).toMatchObject({ kind: 'changed', text: '1 change since last build', count: 1 });
    if (status.kind === 'changed') {
      expect(status.diff.dataModel[0]?.text).toBe('Renamed entity “Note” to “Memo”.');
    }

    must(design.flows.screens[0]).name = 'Sign in';
    expect(buildStatus(built(), design, false, now)).toMatchObject({
      text: '2 changes since last build',
    });
  });

  it('warns quietly about an invalid build.json', () => {
    const issues = [{ path: ['builtAt'], message: 'builtAt must be an ISO timestamp' }];
    expect(buildStatus({ status: 'invalid', issues }, notes(), false, now)).toEqual({
      kind: 'invalid-record',
      text: 'build.json has problems',
      issues,
    });
  });

  it('can’t compare while the design has problems', () => {
    expect(buildStatus(built(), null, false, now)).toEqual({
      kind: 'design-problems',
      text: 'Can’t compare — the design has problems',
      builtAt: BUILT_AT,
    });
  });
});

describe('builtAgo', () => {
  const then = at('2026-10-06T09:00:00');
  const after = (ms: number) => new Date(then.getTime() + ms);
  const MIN = 60_000;

  it.each([
    [0, 'just now'],
    [-5 * MIN, 'just now'],
    [59_999, 'just now'],
    [MIN, '1 minute ago'],
    [12 * MIN, '12 minutes ago'],
    [60 * MIN, '1 hour ago'],
    [23 * 60 * MIN, '23 hours ago'],
    [24 * 60 * MIN, 'yesterday'],
    [3 * 24 * 60 * MIN, '3 days ago'],
  ])('%i ms later reads "%s"', (ms, text) => {
    expect(builtAgo(then, after(ms))).toBe(text);
  });
});
