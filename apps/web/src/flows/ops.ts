import type { Flows, Layout, Position, Screen } from '@modelwright/schema';
import { newId } from '../editing/ids';

/**
 * Every edit to a Flows document is one of these pure functions: `(flows, …args) => flows`,
 * with no React and no I/O. Inputs are never mutated. An operation whose target no longer
 * exists returns the document unchanged (the same object), as does an edit that changes nothing.
 */

export const NEW_SCREEN_NAME = 'Screen';
export const DEFAULT_STATE_NAME = 'Default';

/** Every id in the document (screens, states, CTAs, transitions), for collision checks. */
export function idsIn(flows: Flows): Set<string> {
  const ids = new Set<string>();
  for (const screen of flows.screens) {
    ids.add(screen.id);
    for (const state of screen.states) {
      ids.add(state.id);
      for (const cta of state.ctas) ids.add(cta.id);
    }
  }
  for (const t of flows.transitions) ids.add(t.id);
  return ids;
}

/** Adds a screen named "Screen" with one empty "Default" state, its top-left at `position`. */
export function addScreen(flows: Flows, position: Position): { flows: Flows; id: string } {
  const ids = idsIn(flows);
  const id = newId('scr', ids);
  ids.add(id);
  const screen: Screen = {
    id,
    name: NEW_SCREEN_NAME,
    states: [{ id: newId('st', ids), name: DEFAULT_STATE_NAME, sees: [], ctas: [] }],
  };
  return {
    id,
    flows: {
      ...flows,
      screens: [...flows.screens, screen],
      layout: { ...flows.layout, [id]: roundPosition(position) },
    },
  };
}

/** Sets the layout positions of existing screens, rounded to whole units. Unknown ids are ignored. */
export function moveScreens(flows: Flows, positions: Readonly<Record<string, Position>>): Flows {
  const known = new Set(flows.screens.map((s) => s.id));
  let layout: Layout | null = null;
  for (const [id, position] of Object.entries(positions)) {
    if (!known.has(id)) continue;
    const rounded = roundPosition(position);
    const current = flows.layout[id];
    if (current && current.x === rounded.x && current.y === rounded.y) continue;
    layout ??= { ...flows.layout };
    layout[id] = rounded;
  }
  return layout ? { ...flows, layout } : flows;
}

function roundPosition({ x, y }: Position): Position {
  return { x: Math.round(x), y: Math.round(y) };
}
