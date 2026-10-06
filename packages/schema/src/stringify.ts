import { z } from 'zod';
import type { DesignKind, Layout } from './common';
import type { Config } from './config';
import { SCHEMAS, type DesignDoc } from './documents';
import type { Erd } from './erd';
import type { Flows } from './flows';

/**
 * Serialises a validated document deterministically: keys in the schema's declared order,
 * `layout` keys in the order their nodes appear, 2-space indent, trailing newline.
 * Re-saving an untouched file therefore produces no diff.
 */
export function stringifyDesign<K extends DesignKind>(kind: K, doc: DesignDoc<K>): string {
  const canonical = canonicalise(SCHEMAS[kind], doc) as Record<string, unknown>;
  if (kind === 'erd') orderLayout(canonical, (doc as Erd).entities);
  if (kind === 'flows') orderLayout(canonical, (doc as Flows).screens);
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export const stringifyErd = (doc: Erd): string => stringifyDesign('erd', doc);
export const stringifyFlows = (doc: Flows): string => stringifyDesign('flows', doc);
export const stringifyConfig = (doc: Config): string => stringifyDesign('config', doc);

/** Rebuilds a value following the schema's shape, so key order comes from the schema, not the input. */
export function canonicalise(schema: z.ZodType, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (schema instanceof z.ZodOptional) return canonicalise(schema.unwrap() as z.ZodType, value);
  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    return value.map((item) => canonicalise(schema.element as z.ZodType, item));
  }
  if (schema instanceof z.ZodObject && isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      const child = canonicalise(field, value[key]);
      if (child !== undefined) out[key] = child;
    }
    return out;
  }
  if (schema instanceof z.ZodRecord && isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = canonicalise(schema.valueType as z.ZodType, child);
    }
    return out;
  }
  return value;
}

/** Puts layout entries in node order; any keys without a node (invalid, but be safe) keep their order at the end. */
export function orderLayout(doc: Record<string, unknown>, nodes: readonly { id: string }[]): void {
  const layout = doc['layout'] as Layout;
  const ordered: Layout = {};
  for (const { id } of nodes) {
    const position = layout[id];
    if (position) ordered[id] = position;
  }
  for (const [id, position] of Object.entries(layout)) {
    if (!(id in ordered)) ordered[id] = position;
  }
  doc['layout'] = ordered;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
