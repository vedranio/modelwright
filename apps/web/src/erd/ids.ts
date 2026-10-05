import type { Erd } from '@modelwright/schema';

/** Every id in the document (entities, attributes, relationships), for collision checks. */
export function idsIn(erd: Erd): Set<string> {
  const ids = new Set<string>();
  for (const entity of erd.entities) {
    ids.add(entity.id);
    for (const attribute of entity.attributes) ids.add(attribute.id);
  }
  for (const rel of erd.relationships) ids.add(rel.id);
  return ids;
}
