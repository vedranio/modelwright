import type { Flows, Screen, Transition } from '@modelwright/schema';

/** The target handle on a screen's header: targeting the screen means its default state. */
export const SCREEN_HANDLE = 'screen';

/**
 * A source handle on a CTA row: on the card's right side, or its left. CTA ids are only
 * unique within their state. Edges are drawn from the right handle, which only fixes the
 * height; the route picks the side.
 */
export function ctaHandle(
  stateId: string,
  ctaId: string,
  side: 'left' | 'right' = 'right',
): string {
  return side === 'right' ? `cta:${stateId}:${ctaId}` : `cta-left:${stateId}:${ctaId}`;
}

/** The target handle on a state's header. */
export function stateHandle(stateId: string): string {
  return `state:${stateId}`;
}

/** Whether a screen draws a header for each state. A lone state's header is hidden. */
export function showsStateHeaders(screen: Screen): boolean {
  return screen.states.length > 1;
}

export interface Endpoints {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

/**
 * Which handles a transition is drawn between: from its CTA's row to the target state's header
 * when `to.stateId` is set and that header is shown, otherwise to the target screen's header.
 * A single-state screen hides its state header, so a transition to its one state lands on the
 * screen header. Null when either end is missing (the file is then invalid anyway).
 */
export function transitionEndpoints(
  screens: ReadonlyMap<string, Screen>,
  t: Transition,
): Endpoints | null {
  const from = screens.get(t.from.screenId);
  const to = screens.get(t.to.screenId);
  if (!from || !to) return null;
  const fromState = from.states.find((s) => s.id === t.from.stateId);
  if (!fromState?.ctas.some((c) => c.id === t.from.ctaId)) return null;
  const toState =
    t.to.stateId !== undefined ? to.states.find((s) => s.id === t.to.stateId) : undefined;
  return {
    source: from.id,
    sourceHandle: ctaHandle(fromState.id, t.from.ctaId),
    target: to.id,
    targetHandle: toState && showsStateHeaders(to) ? stateHandle(toState.id) : SCREEN_HANDLE,
  };
}

/** Screens by id, for `transitionEndpoints`. */
export function screensById(flows: Flows): Map<string, Screen> {
  return new Map(flows.screens.map((s) => [s.id, s]));
}

/** Keys `${stateId}:${ctaId}` of every CTA that at least one transition starts from. */
export function connectedCtas(flows: Flows): Set<string> {
  return new Set(flows.transitions.map((t) => `${t.from.stateId}:${t.from.ctaId}`));
}

/** Each transition's place among those starting from the same CTA, which fan out apart. */
export function fanPlaces(flows: Flows): Map<string, { index: number; count: number }> {
  const groups = new Map<string, string[]>();
  for (const t of flows.transitions) {
    const key = `${t.from.screenId}\u0000${t.from.stateId}\u0000${t.from.ctaId}`;
    groups.set(key, [...(groups.get(key) ?? []), t.id]);
  }
  const places = new Map<string, { index: number; count: number }>();
  for (const ids of groups.values()) {
    ids.forEach((id, index) => places.set(id, { index, count: ids.length }));
  }
  return places;
}
