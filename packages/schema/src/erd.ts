import { z } from 'zod';
import { Id, Layout, checkLayoutKeys, checkUniqueIds } from './common';

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

/** `.design/erd.json` — the conceptual ERD. */
export const Erd = z
  .strictObject({
    schemaVersion: z.literal(1),
    entities: z.array(Entity),
    relationships: z.array(Relationship),
    layout: Layout,
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
  });
export type Erd = z.infer<typeof Erd>;
