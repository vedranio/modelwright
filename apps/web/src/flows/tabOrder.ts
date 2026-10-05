import type { Screen } from '@modelwright/schema';
import type { EditTarget } from './editor';

/**
 * Where Tab goes on a screen card: name → notes → the first state's sees items → its CTAs →
 * the next state's name → its sees items → its CTAs → … → done. Entering a list opens its first
 * item, or a new draft when it's empty. These take the screen as it was before the field being
 * left was committed, so callers pass positions in that screen.
 */

/** The first field of a state's sees list. */
export function seesStart(screen: Screen, stateIndex: number): EditTarget | null {
  const state = screen.states[stateIndex];
  if (!state) return null;
  const at = { screenId: screen.id, stateId: state.id };
  return state.sees.length > 0
    ? { kind: 'sees', ...at, index: 0 }
    : { kind: 'seesDraft', ...at, after: null };
}

/** The first field of a state's CTA list. */
export function ctaStart(screen: Screen, stateIndex: number): EditTarget | null {
  const state = screen.states[stateIndex];
  if (!state) return null;
  const at = { screenId: screen.id, stateId: state.id };
  const first = state.ctas[0];
  return first ? { kind: 'cta', ...at, ctaId: first.id } : { kind: 'ctaDraft', ...at, after: null };
}

/** The next state's name, or null after the last state (Tab then ends editing). */
export function nextStateStart(screen: Screen, stateIndex: number): EditTarget | null {
  const next = screen.states[stateIndex + 1];
  return next ? { kind: 'stateName', screenId: screen.id, stateId: next.id } : null;
}

/** After the sees item at `index`: the next item, else the CTAs. */
export function afterSees(screen: Screen, stateIndex: number, index: number): EditTarget | null {
  const state = screen.states[stateIndex];
  if (!state) return null;
  return index + 1 < state.sees.length
    ? { kind: 'sees', screenId: screen.id, stateId: state.id, index: index + 1 }
    : ctaStart(screen, stateIndex);
}

/**
 * After a sees draft that was added following `after` (null: at the end): the item that came
 * next, which has moved down one place, else the CTAs.
 */
export function afterSeesDraft(
  screen: Screen,
  stateIndex: number,
  after: number | null,
): EditTarget | null {
  const state = screen.states[stateIndex];
  if (!state) return null;
  const inserted = after === null ? state.sees.length : after + 1;
  return inserted < state.sees.length
    ? { kind: 'sees', screenId: screen.id, stateId: state.id, index: inserted + 1 }
    : ctaStart(screen, stateIndex);
}

/** After the CTA `ctaId` (or a draft after it; null for the end): the next CTA, else the next state. */
export function afterCta(
  screen: Screen,
  stateIndex: number,
  ctaId: string | null,
): EditTarget | null {
  const state = screen.states[stateIndex];
  if (!state) return null;
  const i = ctaId === null ? state.ctas.length - 1 : state.ctas.findIndex((c) => c.id === ctaId);
  const next = ctaId === null ? undefined : state.ctas[i + 1];
  return next
    ? { kind: 'cta', screenId: screen.id, stateId: state.id, ctaId: next.id }
    : nextStateStart(screen, stateIndex);
}
