import type { Cardinality, Erd, Relationship } from '@modelwright/schema';
import { SafeIds, cellText, inlineText, mermaidText } from './ids';
import { plural } from './plural';

/**
 * Mermaid's crow's-foot symbols. The left one sits at the first entity's end of the line, the
 * right one at the second's, so `from` goes first and each symbol is at its own entity.
 */
export const MERMAID_LEFT: Record<Cardinality, string> = {
  one: '||',
  'zero-one': '|o',
  many: '}|',
  'zero-many': '}o',
};
export const MERMAID_RIGHT: Record<Cardinality, string> = {
  one: '||',
  'zero-one': 'o|',
  many: '|{',
  'zero-many': 'o{',
};

/** How many, in words, and whether the noun after it is plural. */
export const CARDINALITY_WORDS: Record<Cardinality, { words: string; plural: boolean }> = {
  one: { words: 'exactly one', plural: false },
  'zero-one': { words: 'zero or one', plural: false },
  many: { words: 'one or more', plural: true },
  'zero-many': { words: 'zero or more', plural: true },
};

/** The verb for a relationship without a label. */
export const NEUTRAL_VERB = 'has';
/** The verb for reading a relationship backwards. */
export const REVERSE_VERB = 'belongs to';

/**
 * The ERD as a Mermaid `erDiagram`. Attributes are left out: the ERD is conceptual, and
 * Mermaid would want a type for each. They're in the per-entity tables instead.
 */
export function erdMermaid(erd: Erd): string {
  const ids = new SafeIds('e_');
  const lines = ['erDiagram'];
  for (const entity of erd.entities) {
    lines.push(`  ${ids.get(entity.id)}["${mermaidText(entity.name) || ' '}"]`);
  }
  for (const r of erd.relationships) {
    const label = mermaidText(r.label ?? '');
    lines.push(
      `  ${ids.get(r.from)} ${MERMAID_LEFT[r.fromCard]}--${MERMAID_RIGHT[r.toCard]} ${ids.get(r.to)} : "${label}"`,
    );
  }
  return lines.join('\n');
}

/**
 * A relationship in plain words, both ways. `toCard` says how many of `to` each `from` has;
 * `fromCard`, how many of `from` each `to` belongs to.
 * E.g. "Each User owns zero or more Notes. Each Note belongs to exactly one User."
 */
export function relationshipSentences(erd: Erd, r: Relationship): string {
  const name = (id: string) => erd.entities.find((e) => e.id === id)?.name ?? id;
  const from = name(r.from);
  const to = name(r.to);
  const verb = r.label?.trim() || NEUTRAL_VERB;
  return `Each ${from} ${verb} ${counted(r.toCard, to)}. Each ${to} ${REVERSE_VERB} ${counted(r.fromCard, from)}.`;
}

function counted(card: Cardinality, name: string): string {
  const { words, plural: many } = CARDINALITY_WORDS[card];
  return `${words} ${many ? plural(name) : name}`;
}

/** The "Data model" section: the diagram, a table per entity, and the relationships in words. */
export function dataModelSection(erd: Erd): string[] {
  const out = ['## Data model', ''];
  if (erd.entities.length === 0) {
    out.push('No entities yet.', '');
    return out;
  }
  out.push('```mermaid', erdMermaid(erd), '```', '');

  out.push('### Entities', '');
  for (const entity of erd.entities) {
    out.push(`#### ${inlineText(entity.name) || '(unnamed)'}`, '');
    if (entity.description?.trim()) out.push(inlineText(entity.description), '');
    if (entity.attributes.length === 0) {
      out.push('No attributes.', '');
      continue;
    }
    out.push('| Attribute | Note |', '| --- | --- |');
    for (const a of entity.attributes) {
      out.push(`| ${cellText(a.name) || '(unnamed)'} | ${cellText(a.note ?? '')} |`);
    }
    out.push('');
  }

  out.push('### Relationships', '');
  if (erd.relationships.length === 0) {
    out.push('No relationships yet.', '');
  } else {
    for (const r of erd.relationships) out.push(`- ${inlineText(relationshipSentences(erd, r))}`);
    out.push('');
  }
  return out;
}
