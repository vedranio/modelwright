import type { DesignKind, Issue } from './common';

/** The schemaVersion this build reads and writes, per file. */
export const CURRENT_VERSION: Readonly<Record<DesignKind, number>> = {
  erd: 1,
  flows: 2,
  config: 1,
};

/** Upgrades a document from version n to version n + 1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** `MIGRATIONS[kind][n]` upgrades a v`n` document to v`n + 1`. */
export type MigrationTable = Readonly<Record<DesignKind, Readonly<Record<number, Migration>>>>;

export const MIGRATIONS: MigrationTable = {
  erd: {},
  flows: {
    // v2 adds two optional fields to states (`notes`, `primaryCtaId`): every v1 file is a
    // valid v2 file once its version says so.
    1: (doc) => doc,
  },
  config: {},
};

export type MigrateResult = { ok: true; data: unknown } | { ok: false; issues: Issue[] };

/**
 * Brings raw file contents up to the current schemaVersion, dispatching on its `schemaVersion`.
 * Does not validate the document itself — that is the parser's job once migration has run.
 */
export function migrate(kind: DesignKind, data: unknown): MigrateResult {
  return applyMigrations(kind, data, MIGRATIONS, CURRENT_VERSION[kind]);
}

/** The migration mechanism, parameterised so tests can exercise a chain the v1 table doesn't have yet. */
export function applyMigrations(
  kind: DesignKind,
  data: unknown,
  table: MigrationTable,
  current: number,
): MigrateResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail([], `${kind}.json must contain a JSON object`);
  }
  let doc = data as Record<string, unknown>;
  const version = doc['schemaVersion'];

  if (version === undefined) {
    return fail(['schemaVersion'], `${kind}.json has no schemaVersion`);
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail(
      ['schemaVersion'],
      `schemaVersion must be a positive integer, got ${JSON.stringify(version)}`,
    );
  }
  if (version > current) {
    return fail(
      ['schemaVersion'],
      `${kind}.json was written by a newer modelwright (schemaVersion ${version}); this build supports up to ${current}`,
    );
  }

  for (let v = version; v < current; v++) {
    const step = table[kind][v];
    if (!step) {
      return fail(['schemaVersion'], `No migration from ${kind} schemaVersion ${v} to ${v + 1}`);
    }
    doc = { ...step(doc), schemaVersion: v + 1 };
  }
  return { ok: true, data: doc };
}

function fail(path: Issue['path'], message: string): MigrateResult {
  return { ok: false, issues: [{ path, message }] };
}
