import type { Flows, TransitionFrom, TransitionTo } from '@modelwright/schema';
import { ctaHandle } from './endpoints';

/** The CTA a connection drag started from, found by its source handle id (either side). */
export function ctaForHandle(
  flows: Flows,
  screenId: string,
  handleId: string,
): TransitionFrom | null {
  const screen = flows.screens.find((s) => s.id === screenId);
  for (const state of screen?.states ?? []) {
    for (const cta of state.ctas) {
      if (
        ctaHandle(state.id, cta.id) === handleId ||
        ctaHandle(state.id, cta.id, 'left') === handleId
      ) {
        return { screenId, stateId: state.id, ctaId: cta.id };
      }
    }
  }
  return null;
}

/**
 * Where a connection dropped at a point leads. On a screen with several states, dropping
 * anywhere in a state (its header or its body) leads to that state (`stateId` set), and
 * dropping on the screen's header leads to its default state (`stateId` omitted). On a screen
 * with one state, anywhere on the card leads to that state, the default, so `stateId` is
 * omitted. Null for empty canvas, and for the CTA's own state: there's nowhere to go.
 */
export function dropTarget(
  flows: Flows,
  from: TransitionFrom,
  drop: { screenId: string | null; stateId: string | null },
): TransitionTo | null {
  if (!drop.screenId) return null;
  const screen = flows.screens.find((s) => s.id === drop.screenId);
  if (!screen) return null;
  const sameScreen = screen.id === from.screenId;
  const several = screen.states.length > 1;
  if (several && drop.stateId && screen.states.some((s) => s.id === drop.stateId)) {
    if (sameScreen && drop.stateId === from.stateId) return null;
    return { screenId: screen.id, stateId: drop.stateId };
  }
  if (sameScreen && screen.states[0]?.id === from.stateId) return null;
  return { screenId: screen.id };
}
