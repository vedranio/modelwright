import type { DesignKind, Issue } from './common';

/** The schemaVersion this build reads and writes, per file. */
export const CURRENT_VERSION: Readonly<Record<DesignKind, number>> = {
  erd: 2,
  flows: 3,
  config: 1,
};

/** Upgrades a document from version n to version n + 1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** `MIGRATIONS[kind][n]` upgrades a v`n` document to v`n + 1`. */
export type MigrationTable = Readonly<Record<DesignKind, Readonly<Record<number, Migration>>>>;

export const MIGRATIONS: MigrationTable = {
  erd: {
    // v2 adds the optional `anchors` block: every v1 file is a valid v2 file.
    1: (doc) => doc,
  },
  flows: {
    // v2 adds two optional fields to states (`notes`, `primaryCtaId`): every v1 file is a
    // valid v2 file once its version says so.
    1: (doc) => doc,
    // v3 makes information items objects with ids (and adds optional notes on them and on
    // CTAs, and the `anchors` block). Each state's items get ids `info_1`, `info_2`, … in order.
    2: (doc) => ({ ...doc, screens: mapStates(doc['screens'], seesToItems) }),
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

/** Applies `change` to every state object in a raw `screens` array, leaving anything odd alone. */
function mapStates(
  screens: unknown,
  change: (state: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (!Array.isArray(screens)) return screens;
  return screens.map((screen) => {
    if (!isObject(screen) || !Array.isArray(screen['states'])) return screen;
    return {
      ...screen,
      states: screen['states'].map((state) => (isObject(state) ? change(state) : state)),
    };
  });
}

/** v2 → v3: `sees: ["email field"]` becomes `sees: [{ id: "info_1", text: "email field" }]`. */
function seesToItems(state: Record<string, unknown>): Record<string, unknown> {
  const sees = state['sees'];
  if (!Array.isArray(sees)) return state;
  return {
    ...state,
    sees: sees.map((item, i) =>
      typeof item === 'string' ? { id: `info_${i + 1}`, text: item } : item,
    ),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
