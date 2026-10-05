import type { Erd } from '@modelwright/schema';

/**
 * The confirmation to show before deleting these entities and relationships, or null when none
 * is needed. Only a cascade asks: an entity that still has attributes or relationships.
 * Deleting empty entities and bare relationships goes ahead without asking.
 * E.g. "Delete 'User', its 2 attributes and 1 relationship?"
 */
export function deletionPrompt(
  erd: Erd,
  entityIds: ReadonlySet<string>,
  relationshipIds: ReadonlySet<string>,
): string | null {
  const entities = erd.entities.filter((e) => entityIds.has(e.id));
  if (entities.length === 0) return null;

  const attributes = entities.reduce((n, e) => n + e.attributes.length, 0);
  const touching = erd.relationships.filter((r) => entityIds.has(r.from) || entityIds.has(r.to));
  if (attributes === 0 && touching.length === 0) return null;

  const relationships = erd.relationships.filter(
    (r) => entityIds.has(r.from) || entityIds.has(r.to) || relationshipIds.has(r.id),
  ).length;

  const [only] = entities;
  const subject = entities.length === 1 && only ? `'${only.name}'` : `${entities.length} entities`;
  const their = entities.length === 1 ? 'its' : 'their';
  const parts = [
    attributes > 0 && count(attributes, 'attribute'),
    relationships > 0 && count(relationships, 'relationship'),
  ].filter((p): p is string => p !== false);

  return parts.length === 2
    ? `Delete ${subject}, ${their} ${parts[0]} and ${parts[1]}?`
    : `Delete ${subject} and ${their} ${parts[0]}?`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
