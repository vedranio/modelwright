import { z } from 'zod';

/** The three files that live in a project's `.design/` folder. */
export const DESIGN_KINDS = ['erd', 'flows', 'config'] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

export function isDesignKind(value: unknown): value is DesignKind {
  return typeof value === 'string' && (DESIGN_KINDS as readonly string[]).includes(value);
}

/** Ids are opaque, non-empty strings. The tool generates them; the schema does not care about format. */
export const Id = z.string().min(1, 'Id must be a non-empty string');

export const Position = z.strictObject({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof Position>;

/** Node positions, keyed by entity or screen id. Kept apart from the semantic block. */
export const Layout = z.record(Id, Position);
export type Layout = z.infer<typeof Layout>;

export type IssuePath = (string | number)[];

/** One problem in a design file, with the path to where it is. */
export interface Issue {
  path: IssuePath;
  message: string;
}

/** Reports a custom issue for every item whose id repeats an earlier one in the same collection. */
export function checkUniqueIds(
  ctx: z.RefinementCtx,
  items: readonly { id: string }[],
  path: IssuePath,
  label: string,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate ${label} id "${item.id}"`,
        path: [...path, index, 'id'],
      });
    }
    seen.add(item.id);
  });
}

/** Reports a custom issue for every layout key that doesn't name a node in the document. */
export function checkLayoutKeys(
  ctx: z.RefinementCtx,
  layout: Layout,
  nodeIds: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(layout)) {
    if (!nodeIds.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `Layout refers to unknown ${label} "${key}"`,
        path: ['layout', key],
      });
    }
  }
}
