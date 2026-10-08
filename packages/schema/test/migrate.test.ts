import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DESIGN_KINDS, migrate, parseErd, parseFlows } from '../src/index';
import { applyMigrations, type MigrationTable } from '../src/migrate';
import { expectIssue, fixture } from './helpers';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('migrate', () => {
  it('upgrades a v1 flows.json to v2 without changing anything else', () => {
    const v1 = JSON.parse(readFileSync(`${FIXTURES}/v1/flows.json`, 'utf8'));
    expect(v1.schemaVersion).toBe(1);
    const result = parseFlows(v1);
    expect(result.ok && result.doc).toEqual({ ...fixture('flows'), schemaVersion: 2 });
  });

  it.each(DESIGN_KINDS)('is a no-op for a current %s document', (kind) => {
    const doc = fixture(kind);
    const result = migrate(kind, doc);
    expect(result).toEqual({ ok: true, data: doc });
    if (result.ok) expect(result.data).toBe(doc);
  });

  it('rejects a newer schemaVersion with a clear message', () => {
    const erd = { ...fixture('erd'), schemaVersion: 2 };
    expectIssue(
      parseErd(erd),
      ['schemaVersion'],
      /written by a newer modelwright \(schemaVersion 2\); this build supports up to 1/,
    );
  });

  it('rejects a missing schemaVersion', () => {
    const erd = fixture('erd');
    delete erd.schemaVersion;
    expectIssue(parseErd(erd), ['schemaVersion'], /no schemaVersion/);
  });

  it.each([0, -1, 1.5, '1', null])('rejects schemaVersion %j', (version) => {
    const erd = { ...fixture('erd'), schemaVersion: version };
    expectIssue(parseErd(erd), ['schemaVersion'], /positive integer/);
  });

  it('rejects a document that is not an object', () => {
    expectIssue(parseErd([]), [], /must contain a JSON object/);
  });

  describe('mechanism', () => {
    // A stand-in for the phase 2+ table: v1 → v2 adds a field, v2 → v3 renames one.
    const table: MigrationTable = {
      erd: {
        1: (doc) => ({ ...doc, added: true }),
        2: ({ added, ...rest }) => ({ ...rest, renamed: added }),
      },
      flows: {},
      config: {},
    };

    it('runs each step in order and stamps the new version', () => {
      const result = applyMigrations('erd', { schemaVersion: 1, keep: 'x' }, table, 3);
      expect(result).toEqual({ ok: true, data: { schemaVersion: 3, keep: 'x', renamed: true } });
    });

    it('starts from the document version', () => {
      const result = applyMigrations('erd', { schemaVersion: 2, added: 'y' }, table, 3);
      expect(result).toEqual({ ok: true, data: { schemaVersion: 3, renamed: 'y' } });
    });

    it('fails when a step is missing', () => {
      const result = applyMigrations('flows', { schemaVersion: 1 }, table, 2);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.issues[0]?.message).toMatch(/No migration from flows schemaVersion 1 to 2/);
    });
  });
});
