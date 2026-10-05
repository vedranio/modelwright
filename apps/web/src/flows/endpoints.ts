import type { Flows, Screen, Transition } from '@modelwright/schema';

/** The target handle on a screen's header: targeting the screen means its default state. */
export const SCREEN_HANDLE = 'screen';

/** The source handle on a CTA row. CTA ids are only unique within their state. */
export function ctaHandle(stateId: string, ctaId: string): string {
  return `cta:${stateId}:${ctaId}`;
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
