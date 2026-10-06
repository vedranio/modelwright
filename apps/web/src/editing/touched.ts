import type { Erd, Flows, Layout } from '@modelwright/schema';

/** The nodes and edges an undo or redo step touched, to select afterwards. */
export interface Touched {
  nodes: Set<string>;
  edges: Set<string>;
}

/**
 * What changed between two ERDs, as it exists in `after`: entities that are new or whose
 * content or position changed (an attribute edit selects its entity), and relationships that
 * are new or changed. Things that no longer exist can't be selected, so they're left out.
 */
export function touchedErd(before: Erd, after: Erd): Touched {
  return {
    nodes: changedIds(before.entities, after.entities, before.layout, after.layout),
    edges: changedIds(before.relationships, after.relationships),
  };
}

/** The same for flows: screens (states, sees items and CTAs included) and transitions. */
export function touchedFlows(before: Flows, after: Flows): Touched {
  return {
    nodes: changedIds(before.screens, after.screens, before.layout, after.layout),
    edges: changedIds(before.transitions, after.transitions),
  };
}

function changedIds<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  layoutBefore?: Layout,
  layoutAfter?: Layout,
): Set<string> {
  const previous = new Map(before.map((item) => [item.id, item]));
  const changed = new Set<string>();
  for (const item of after) {
    const old = previous.get(item.id);
    const same =
      old !== undefined &&
      (old === item || JSON.stringify(old) === JSON.stringify(item)) &&
      JSON.stringify(layoutBefore?.[item.id]) === JSON.stringify(layoutAfter?.[item.id]);
    if (!same) changed.add(item.id);
  }
  return changed;
}
