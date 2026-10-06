import type { z } from 'zod';
import type { DesignKind, Issue } from './common';
import type { Config } from './config';
import { SCHEMAS, type DesignDoc } from './documents';
import type { Erd } from './erd';
import type { Flows } from './flows';
import { migrate } from './migrate';

/** Why a design file failed to load: which file, and every problem with its path. */
export interface DesignError {
  file: DesignKind;
  issues: Issue[];
}

export type ParseResult<T> = { ok: true; doc: T } | { ok: false; error: DesignError };

/** Migrates then validates already-decoded JSON. */
export function parseDesign<K extends DesignKind>(
  kind: K,
  data: unknown,
): ParseResult<DesignDoc<K>> {
  const migrated = migrate(kind, data);
  if (!migrated.ok) return { ok: false, error: { file: kind, issues: migrated.issues } };

  const result = SCHEMAS[kind].safeParse(migrated.data);
  if (!result.success) {
    return { ok: false, error: { file: kind, issues: toIssues(result.error) } };
  }
  return { ok: true, doc: result.data as DesignDoc<K> };
}

/** Decodes file text, then migrates and validates. A JSON syntax error is reported at the root path. */
export function parseDesignJson<K extends DesignKind>(
  kind: K,
  text: string,
): ParseResult<DesignDoc<K>> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { file: kind, issues: [{ path: [], message: `Invalid JSON: ${detail}` }] },
    };
  }
  return parseDesign(kind, data);
}

export const parseErd = (data: unknown): ParseResult<Erd> => parseDesign('erd', data);
export const parseFlows = (data: unknown): ParseResult<Flows> => parseDesign('flows', data);
export const parseConfig = (data: unknown): ParseResult<Config> => parseDesign('config', data);

export function toIssues(error: z.ZodError): Issue[] {
  return error.issues.flatMap((issue): Issue[] => {
    const path = issue.path.map((segment) =>
      typeof segment === 'number' ? segment : String(segment),
    );
    // zod reports all unknown keys of an object as one issue on the object; point at each key instead.
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ path: [...path, key], message: `Unknown key "${key}"` }));
    }
    return [{ path, message: issue.message }];
  });
}
