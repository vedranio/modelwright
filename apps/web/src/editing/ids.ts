import { customAlphabet } from 'nanoid';

/** Every id prefix the editors generate: ERD entities, attributes and relationships; flow screens, states, CTAs and transitions. */
export type IdPrefix = 'ent' | 'attr' | 'rel' | 'scr' | 'st' | 'cta' | 'tr';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const LENGTH = 8;
const randomPart = customAlphabet(ALPHABET, LENGTH);

/**
 * A new id such as `ent_k3x9qz2m`: a readable prefix and 8 lowercase alphanumerics, so
 * `.design/` diffs stay legible. Retries until it doesn't collide with `existing`.
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
