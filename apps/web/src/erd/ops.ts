import type { Attribute, Cardinality, Entity, Erd, Layout, Position } from '@modelwright/schema';
import { newId } from '../editing/ids';
import { DUPLICATE_OFFSET, moveItem } from '../editing/reorder';
import { idsIn } from './ids';

/**
 * Every edit to an ERD is one of these pure functions: `(erd, …args) => erd`, with no React and
 * no I/O. Inputs are never mutated. An operation whose target no longer exists (deleted
 * elsewhere a moment ago) returns the document unchanged rather than throwing.
 */

export const NEW_ENTITY_NAME = 'Entity';

/** Adds an entity named "Entity" with no attributes at `position` (its top-left corner). */
export function addEntity(erd: Erd, position: Position): { erd: Erd; id: string } {
  const id = newId('ent', idsIn(erd));
  const entity: Entity = { id, name: NEW_ENTITY_NAME, attributes: [] };
  return {
    id,
    erd: {
      ...erd,
      entities: [...erd.entities, entity],
      layout: { ...erd.layout, [id]: roundPosition(position) },
    },
  };
}

export function renameEntity(erd: Erd, entityId: string, name: string): Erd {
  return mapEntity(erd, entityId, (e) => (e.name === name ? e : { ...e, name }));
}

/** Sets the description; an empty or blank one removes the key. */
export function setEntityDescription(erd: Erd, entityId: string, description: string): Erd {
  return mapEntity(erd, entityId, (e) => withOptional(e, 'description', description));
}

/** Removes the entities, every relationship touching them, and their layout entries. */
export function deleteEntities(erd: Erd, entityIds: Iterable<string>): Erd {
  const gone = new Set(entityIds);
  if (!erd.entities.some((e) => gone.has(e.id))) return erd;
  return {
    ...erd,
    entities: erd.entities.filter((e) => !gone.has(e.id)),
    relationships: erd.relationships.filter((r) => !gone.has(r.from) && !gone.has(r.to)),
    layout: omitKeys(erd.layout, gone),
  };
}

/**
 * Adds an empty attribute to the entity, directly after `afterAttributeId` when given (and
 * found), otherwise at the end. Returns the new id, or null if the entity doesn't exist.
 */
export function addAttribute(
  erd: Erd,
  entityId: string,
  afterAttributeId?: string,
): { erd: Erd; id: string | null } {
  if (!erd.entities.some((e) => e.id === entityId)) return { erd, id: null };
  const id = newId('attr', idsIn(erd));
  const attribute: Attribute = { id, name: '' };
  return {
    id,
    erd: mapEntity(erd, entityId, (e) => {
      const after = afterAttributeId
        ? e.attributes.findIndex((a) => a.id === afterAttributeId)
        : -1;
      const at = after === -1 ? e.attributes.length : after + 1;
      return {
        ...e,
        attributes: [...e.attributes.slice(0, at), attribute, ...e.attributes.slice(at)],
      };
    }),
  };
}

/** Changes an attribute's name and/or note. An empty or blank note removes the key. */
export function updateAttribute(
  erd: Erd,
  entityId: string,
  attributeId: string,
  changes: { name?: string; note?: string },
): Erd {
  return mapEntity(erd, entityId, (e) => {
    let changed = false;
    const attributes = e.attributes.map((a) => {
      if (a.id !== attributeId) return a;
      let next = a;
      if (changes.name !== undefined && changes.name !== a.name)
        next = { ...next, name: changes.name };
      if (changes.note !== undefined) next = withOptional(next, 'note', changes.note);
      if (next !== a) changed = true;
      return next;
    });
    return changed ? { ...e, attributes } : e;
  });
}

export function deleteAttribute(erd: Erd, entityId: string, attributeId: string): Erd {
  return mapEntity(erd, entityId, (e) =>
    e.attributes.some((a) => a.id === attributeId)
      ? { ...e, attributes: e.attributes.filter((a) => a.id !== attributeId) }
      : e,
  );
}

/**
 * Sets the positions of the given entities, rounded to whole canvas units so diffs stay
 * readable. Ids that aren't entities are ignored.
 */
export function moveEntities(erd: Erd, positions: Readonly<Record<string, Position>>): Erd {
  const known = new Set(erd.entities.map((e) => e.id));
  let layout: Layout | null = null;
  for (const [id, position] of Object.entries(positions)) {
    if (!known.has(id)) continue;
    const rounded = roundPosition(position);
    const current = erd.layout[id];
    if (current && current.x === rounded.x && current.y === rounded.y) continue;
    layout ??= { ...erd.layout };
    layout[id] = rounded;
  }
  return layout ? { ...erd, layout } : erd;
}

/**
 * Adds a relationship from one entity to another with the default cardinalities: `one` at the
 * `from` end and `zero-many` at the `to` end. Returns null as the id if either entity is missing.
 */
export function addRelationship(
  erd: Erd,
  from: string,
  to: string,
): { erd: Erd; id: string | null } {
  const known = new Set(erd.entities.map((e) => e.id));
  if (!known.has(from) || !known.has(to)) return { erd, id: null };
  const id = newId('rel', idsIn(erd));
  return {
    id,
    erd: {
      ...erd,
      relationships: [...erd.relationships, { id, from, to, fromCard: 'one', toCard: 'zero-many' }],
    },
  };
}

/** Changes a relationship's cardinalities and/or label. An empty or blank label removes the key. */
export function updateRelationship(
  erd: Erd,
  relationshipId: string,
  changes: { fromCard?: Cardinality; toCard?: Cardinality; label?: string },
): Erd {
  return mapRelationship(erd, relationshipId, (r) => {
    let next = r;
    if (changes.fromCard !== undefined && changes.fromCard !== r.fromCard) {
      next = { ...next, fromCard: changes.fromCard };
    }
    if (changes.toCard !== undefined && changes.toCard !== r.toCard) {
      next = { ...next, toCard: changes.toCard };
    }
    if (changes.label !== undefined) next = withOptional(next, 'label', changes.label);
    return next;
  });
}

/** Swaps the two ends: `from` with `to`, and `fromCard` with `toCard`. */
export function reverseRelationship(erd: Erd, relationshipId: string): Erd {
  return mapRelationship(erd, relationshipId, (r) => ({
    ...r,
    from: r.to,
    to: r.from,
    fromCard: r.toCard,
    toCard: r.fromCard,
  }));
}

export function deleteRelationships(erd: Erd, relationshipIds: Iterable<string>): Erd {
  const gone = new Set(relationshipIds);
  if (!erd.relationships.some((r) => gone.has(r.id))) return erd;
  return { ...erd, relationships: erd.relationships.filter((r) => !gone.has(r.id)) };
}

// --- helpers ---

function mapEntity(erd: Erd, entityId: string, change: (e: Entity) => Entity): Erd {
  let changed = false;
  const entities = erd.entities.map((e) => {
    if (e.id !== entityId) return e;
    const next = change(e);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? { ...erd, entities } : erd;
}

function mapRelationship(
  erd: Erd,
  relationshipId: string,
  change: (r: Erd['relationships'][number]) => Erd['relationships'][number],
): Erd {
  let changed = false;
  const relationships = erd.relationships.map((r) => {
    if (r.id !== relationshipId) return r;
    const next = change(r);
    if (next !== r) changed = true;
    return next;
  });
  return changed ? { ...erd, relationships } : erd;
}

/** Sets an optional string field, removing the key when the value is blank. */
function withOptional<T extends object, K extends keyof T & string>(
  obj: T,
  key: K,
  value: string,
): T {
  const current = (obj as Record<string, unknown>)[key];
  if (value.trim() === '') {
    if (current === undefined) return obj;
    return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as T;
  }
  return current === value ? obj : { ...obj, [key]: value };
}

function omitKeys(layout: Layout, keys: ReadonlySet<string>): Layout {
  const out: Layout = {};
  for (const [id, position] of Object.entries(layout)) {
    if (!keys.has(id)) out[id] = position;
  }
  return out;
}

function roundPosition({ x, y }: Position): Position {
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Moves an attribute `offset` places within its entity (−1 up, 1 down). Moving past either end
 * is a no-op.
 */
export function moveAttribute(
  erd: Erd,
  entityId: string,
  attributeId: string,
  offset: number,
): Erd {
  return mapEntity(erd, entityId, (e) => {
    const attributes = moveItem(
      e.attributes,
      e.attributes.findIndex((a) => a.id === attributeId),
      offset,
    );
    return attributes ? { ...e, attributes } : e;
  });
}

/**
 * Copies the entities with fresh ids (attributes included), one grid step down and right of
 * the originals, keeping their names. Relationships between two copied entities are copied
 * too; ones to entities outside the selection aren't. Returns the copies' ids in order.
 */
export function duplicateEntities(
  erd: Erd,
  entityIds: Iterable<string>,
): { erd: Erd; ids: string[] } {
  const chosen = new Set(entityIds);
  const originals = erd.entities.filter((e) => chosen.has(e.id));
  if (originals.length === 0) return { erd, ids: [] };

  const taken = idsIn(erd);
  const fresh = (prefix: 'ent' | 'attr' | 'rel') => {
    const id = newId(prefix, taken);
    taken.add(id);
    return id;
  };
  const copyOf = new Map<string, string>();
  const layout: Layout = { ...erd.layout };
  const copies = originals.map((e): Entity => {
    const id = fresh('ent');
    copyOf.set(e.id, id);
    const at = erd.layout[e.id];
    if (at) layout[id] = { x: at.x + DUPLICATE_OFFSET, y: at.y + DUPLICATE_OFFSET };
    return { ...e, id, attributes: e.attributes.map((a) => ({ ...a, id: fresh('attr') })) };
  });
  const relationships = erd.relationships.flatMap((r) => {
    const from = copyOf.get(r.from);
    const to = copyOf.get(r.to);
    return from && to ? [{ ...r, id: fresh('rel'), from, to }] : [];
  });
  return {
    ids: copies.map((c) => c.id),
    erd: {
      ...erd,
      entities: [...erd.entities, ...copies],
      relationships: [...erd.relationships, ...relationships],
      layout,
    },
  };
}
