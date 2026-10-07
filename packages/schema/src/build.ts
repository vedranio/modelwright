import { z } from 'zod';
import { Id, type Issue } from './common';
import { Config } from './config';
import { Erd } from './erd';
import { Flows } from './flows';
import { migrate } from './migrate';
import { toIssues } from './parse';
import { canonicalise, orderLayout } from './stringify';

/** Where one design element lives in code: file paths, or `file#symbol` references. */
const CodeRefs = z.array(z.string().min(1, 'A code reference must be a non-empty string'));

/**
 * Where each design element lives in code, written by the build-from-design skill. State ids
 * are only unique within their screen, so states are keyed by screen, then by state.
 */
export const BuildMap = z.strictObject({
  entities: z.record(Id, CodeRefs).optional(),
  screens: z.record(Id, CodeRefs).optional(),
  states: z.record(Id, z.record(Id, CodeRefs)).optional(),
});
export type BuildMap = z.infer<typeof BuildMap>;

/** The three design files, each valid by its own schema. */
export const DesignSnapshot = z.strictObject({
  config: Config,
  erd: Erd,
  flows: Flows,
});
export type DesignSnapshot = z.infer<typeof DesignSnapshot>;

/**
 * `.design/build.json` — the design as it was last built, and where it lives in code. Written
 * only by the `modelwright-design` CLI after a verified build; modelwright itself only reads it.
 *
 * The snapshot uses the current design schemas. A future design `schemaVersion` bump must ship
 * a build-record migration that upgrades the snapshot too.
 */
export const BuildRecord = z
  .strictObject({
    schemaVersion: z.literal(1),
    /** When the build was recorded, as an ISO timestamp. */
    builtAt: z.iso.datetime({ message: 'builtAt must be an ISO timestamp' }),
    snapshot: DesignSnapshot,
    map: BuildMap.optional(),
  })
  .superRefine((record, ctx) => {
    const { map, snapshot } = record;
    if (!map) return;
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', message, path: ['map', ...path] });

    const entityIds = new Set(snapshot.erd.entities.map((e) => e.id));
    for (const id of Object.keys(map.entities ?? {})) {
      if (!entityIds.has(id)) issue(['entities', id], `Map refers to unknown entity "${id}"`);
    }
    const screens = new Map(snapshot.flows.screens.map((s) => [s.id, s]));
    for (const id of Object.keys(map.screens ?? {})) {
      if (!screens.has(id)) issue(['screens', id], `Map refers to unknown screen "${id}"`);
    }
    for (const [screenId, states] of Object.entries(map.states ?? {})) {
      const screen = screens.get(screenId);
      if (!screen) {
        issue(['states', screenId], `Map refers to unknown screen "${screenId}"`);
        continue;
      }
      const stateIds = new Set(screen.states.map((s) => s.id));
      for (const stateId of Object.keys(states)) {
        if (!stateIds.has(stateId)) {
          issue(
            ['states', screenId, stateId],
            `Map refers to unknown state "${stateId}" on screen "${screenId}"`,
          );
        }
      }
    }
  });
export type BuildRecord = z.infer<typeof BuildRecord>;

export const BUILD_RECORD_VERSION = 1;

export type BuildRecordResult = { ok: true; record: BuildRecord } | { ok: false; issues: Issue[] };

/** Validates already-decoded `build.json` contents. */
export function parseBuildRecord(data: unknown): BuildRecordResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, issues: [{ path: [], message: 'build.json must contain a JSON object' }] };
  }
  const version = (data as Record<string, unknown>)['schemaVersion'];
  if (typeof version === 'number' && Number.isInteger(version) && version > BUILD_RECORD_VERSION) {
    return {
      ok: false,
      issues: [
        {
          path: ['schemaVersion'],
          message: `build.json was written by a newer modelwright (schemaVersion ${version}); this build supports up to ${BUILD_RECORD_VERSION}`,
        },
      ],
    };
  }
  const migrated = migrateSnapshot(data as Record<string, unknown>);
  if (!migrated.ok) return migrated;
  const result = BuildRecord.safeParse(migrated.data);
  if (!result.success) return { ok: false, issues: toIssues(result.error) };
  return { ok: true, record: result.data };
}

/**
 * Brings each design document in the snapshot up to the current schemaVersion, so a build
 * recorded by an older modelwright still reads. Anything that isn't a document is left for
 * the schema to report.
 */
function migrateSnapshot(
  data: Record<string, unknown>,
): { ok: true; data: unknown } | { ok: false; issues: Issue[] } {
  const snapshot = data['snapshot'];
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    return { ok: true, data };
  }
  const next: Record<string, unknown> = { ...(snapshot as Record<string, unknown>) };
  for (const kind of ['config', 'erd', 'flows'] as const) {
    const doc = next[kind];
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) continue;
    const result = migrate(kind, doc);
    if (!result.ok) {
      return {
        ok: false,
        issues: result.issues.map((i) => ({ ...i, path: ['snapshot', kind, ...i.path] })),
      };
    }
    next[kind] = result.data;
  }
  return { ok: true, data: { ...data, snapshot: next } };
}

/** Decodes and validates `build.json` text. A JSON syntax error is reported at the root path. */
export function parseBuildRecordJson(text: string): BuildRecordResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: [{ path: [], message: `Invalid JSON: ${detail}` }] };
  }
  return parseBuildRecord(data);
}

/**
 * Serialises a build record the way design files are: keys in schema order, 2-space indent,
 * trailing newline. Layout and map keys follow the design's own node order, so recording the
 * same build twice gives the same bytes.
 */
export function stringifyBuildRecord(record: BuildRecord): string {
  const out = canonicalise(BuildRecord, record) as Record<string, unknown>;
  const snapshot = out['snapshot'] as Record<string, Record<string, unknown>>;
  const { erd, flows } = record.snapshot;
  orderLayout(snapshot['erd'] as Record<string, unknown>, erd.entities);
  orderLayout(snapshot['flows'] as Record<string, unknown>, flows.screens);

  const map = out['map'] as Record<string, Record<string, unknown>> | undefined;
  if (map) {
    if (map['entities']) map['entities'] = inOrder(map['entities'], erd.entities);
    if (map['screens']) map['screens'] = inOrder(map['screens'], flows.screens);
    if (map['states']) {
      const states = inOrder(map['states'], flows.screens) as Record<
        string,
        Record<string, unknown>
      >;
      for (const screen of flows.screens) {
        const byState = states[screen.id];
        if (byState) states[screen.id] = inOrder(byState, screen.states);
      }
      map['states'] = states;
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** `record`'s keys in the order of `nodes`, then any others in their own order. */
function inOrder<T>(
  record: Record<string, T>,
  nodes: readonly { id: string }[],
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const { id } of nodes) {
    if (id in record) out[id] = record[id] as T;
  }
  for (const [id, value] of Object.entries(record)) {
    if (!(id in out)) out[id] = value;
  }
  return out;
}
