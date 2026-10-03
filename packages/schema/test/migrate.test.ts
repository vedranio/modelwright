import { describe, expect, it } from 'vitest';
import { DESIGN_KINDS, migrate, parseErd } from '../src/index';
import { applyMigrations, type MigrationTable } from '../src/migrate';
import { expectIssue, fixture } from './helpers';

describe('migrate', () => {
  it.each(DESIGN_KINDS)('is a no-op for a v1 %s document', (kind) => {
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
