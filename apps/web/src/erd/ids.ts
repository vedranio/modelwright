import { customAlphabet } from 'nanoid';
import type { Erd } from '@modelwright/schema';

export type IdPrefix = 'ent' | 'attr' | 'rel';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const LENGTH = 8;
const randomPart = customAlphabet(ALPHABET, LENGTH);

/**
 * A new id such as `ent_k3x9qz2m`: a readable prefix and 8 lowercase alphanumerics, so
 * `erd.json` diffs stay legible. Retries until it doesn't collide with `existing`.
 * `random` is injectable for tests.
 */
export function newId(
  prefix: IdPrefix,
  existing: ReadonlySet<string>,
  random: () => string = randomPart,
): string {
  for (;;) {
    const id = `${prefix}_${random()}`;
    if (!existing.has(id)) return id;
  }
}

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
