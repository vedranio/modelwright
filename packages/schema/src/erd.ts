import { z } from 'zod';
import { Id, Layout, checkAnchorKeys, checkLayoutKeys, checkUniqueIds } from './common';

export const Cardinality = z.enum(['one', 'zero-one', 'many', 'zero-many']);
export type Cardinality = z.infer<typeof Cardinality>;

export const Attribute = z.strictObject({
  id: Id,
  name: z.string(),
  note: z.string().optional(),
});
export type Attribute = z.infer<typeof Attribute>;

export const Entity = z.strictObject({
  id: Id,
  name: z.string(),
  description: z.string().optional(),
  attributes: z.array(Attribute),
});
export type Entity = z.infer<typeof Entity>;

export const Relationship = z.strictObject({
  id: Id,
  from: Id,
  to: Id,
  fromCard: Cardinality,
  toCard: Cardinality,
  label: z.string().optional(),
});
export type Relationship = z.infer<typeof Relationship>;

export const Side = z.enum(['top', 'right', 'bottom', 'left']);
export type Side = z.infer<typeof Side>;

/** Where a relationship's end meets its card: a side, and how far along it (0 to 1). */
export const Anchor = z.strictObject({
  side: Side,
  at: z.number().min(0).max(1),
});
export type Anchor = z.infer<typeof Anchor>;

/** A relationship's fixed ends; an end not given is placed automatically. Layout, not meaning. */
export const RelationshipAnchors = z.strictObject({
  from: Anchor.optional(),
  to: Anchor.optional(),
});
export type RelationshipAnchors = z.infer<typeof RelationshipAnchors>;

/** `.design/erd.json` — the conceptual ERD. */
export const Erd = z
  .strictObject({
    schemaVersion: z.literal(2),
    entities: z.array(Entity),
    relationships: z.array(Relationship),
    layout: Layout,
    /** Where relationships join their cards, by relationship id. Added in schemaVersion 2. */
    anchors: z.record(Id, RelationshipAnchors).optional(),
  })
  .superRefine((erd, ctx) => {
    checkUniqueIds(ctx, erd.entities, ['entities'], 'entity');
    checkUniqueIds(ctx, erd.relationships, ['relationships'], 'relationship');
    erd.entities.forEach((entity, i) => {
      checkUniqueIds(ctx, entity.attributes, ['entities', i, 'attributes'], 'attribute');
    });

    const entityIds = new Set(erd.entities.map((e) => e.id));
    erd.relationships.forEach((rel, i) => {
      for (const end of ['from', 'to'] as const) {
        if (!entityIds.has(rel[end])) {
          ctx.addIssue({
            code: 'custom',
            message: `Relationship "${rel.id}" points at unknown entity "${rel[end]}"`,
            path: ['relationships', i, end],
          });
        }
      }
    });

    checkLayoutKeys(ctx, erd.layout, entityIds, 'entity');
    checkAnchorKeys(ctx, erd.anchors, new Set(erd.relationships.map((r) => r.id)), 'relationship');
  });
export type Erd = z.infer<typeof Erd>;
