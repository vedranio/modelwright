import type { Flows, TransitionFrom, TransitionTo } from '@modelwright/schema';
import { ctaHandle } from './endpoints';

/** The CTA a connection drag started from, found by its source handle id. */
export function ctaForHandle(
  flows: Flows,
  screenId: string,
  handleId: string,
): TransitionFrom | null {
  const screen = flows.screens.find((s) => s.id === screenId);
  for (const state of screen?.states ?? []) {
    for (const cta of state.ctas) {
      if (ctaHandle(state.id, cta.id) === handleId) {
        return { screenId, stateId: state.id, ctaId: cta.id };
      }
    }
  }
  return null;
}

/**
 * Where a connection dropped at a point leads: onto a state header, that state (`stateId` set);
 * anywhere else on a screen card, including its header, the screen's default state (`stateId`
 * omitted). Null for empty canvas, and for the CTA's own state: its own state header, or anywhere
 * on its own card when it sits in the default state. Dropping elsewhere on its own card makes a
 * same-screen transition to the default state.
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
  if (drop.stateId && screen.states.some((s) => s.id === drop.stateId)) {
    if (sameScreen && drop.stateId === from.stateId) return null;
    return { screenId: screen.id, stateId: drop.stateId };
  }
  if (sameScreen && screen.states[0]?.id === from.stateId) return null;
  return { screenId: screen.id };
}
