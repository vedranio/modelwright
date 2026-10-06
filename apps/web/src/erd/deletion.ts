import type { Erd } from '@modelwright/schema';
import { count, deletedMessage, quoted } from '../editing/deletion';

/**
 * The undo toast's text for deleting these entities and relationships, counting everything
 * the delete takes with it, or null when nothing would go.
 * E.g. "Deleted 'User', 2 attributes and 1 relationship".
 */
export function deletionSummary(
  erd: Erd,
  entityIds: ReadonlySet<string>,
  relationshipIds: ReadonlySet<string>,
): string | null {
  const entities = erd.entities.filter((e) => entityIds.has(e.id));
  const relationships = erd.relationships.filter(
    (r) => entityIds.has(r.from) || entityIds.has(r.to) || relationshipIds.has(r.id),
  );
  if (entities.length === 0) {
    const [only] = relationships;
    if (!only) return null;
    if (relationships.length > 1)
      return deletedMessage(count(relationships.length, 'relationship'));
    const name = (id: string) => quoted(erd.entities.find((e) => e.id === id)?.name ?? id);
    return only.from === only.to
      ? `Deleted the relationship from ${name(only.from)} to itself`
      : `Deleted the relationship between ${name(only.from)} and ${name(only.to)}`;
  }

  const [only] = entities;
  const attributes = entities.reduce((n, e) => n + e.attributes.length, 0);
  return deletedMessage(
    entities.length === 1 && only ? quoted(only.name) : count(entities.length, 'entity'),
    attributes > 0 && count(attributes, 'attribute'),
    relationships.length > 0 && count(relationships.length, 'relationship'),
  );
}

/** "Deleted attribute 'email'". */
export function attributeDeletionSummary(erd: Erd, entityId: string, attributeId: string) {
  const attribute = erd.entities
    .find((e) => e.id === entityId)
    ?.attributes.find((a) => a.id === attributeId);
  if (!attribute) return null;
  return attribute.name.trim()
    ? `Deleted attribute ${quoted(attribute.name)}`
    : 'Deleted an attribute';
}
