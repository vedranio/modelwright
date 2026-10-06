import type { Flows, Transition } from '@modelwright/schema';
import { count, deletedMessage, quoted } from '../editing/deletion';

/**
 * The undo toast's text for deleting these screens and transitions, counting every transition
 * the delete takes with it, or null when nothing would go.
 * E.g. "Deleted 'Login' and 3 transitions".
 */
export function deletionSummary(
  flows: Flows,
  screenIds: ReadonlySet<string>,
  transitionIds: ReadonlySet<string>,
): string | null {
  const screens = flows.screens.filter((s) => screenIds.has(s.id));
  const transitions = flows.transitions.filter(
    (t) =>
      screenIds.has(t.from.screenId) || screenIds.has(t.to.screenId) || transitionIds.has(t.id),
  );
  if (screens.length === 0) {
    const [only] = transitions;
    if (!only) return null;
    if (transitions.length > 1) return deletedMessage(count(transitions.length, 'transition'));
    return `Deleted the transition ${describe(flows, only)}`;
  }
  const [only] = screens;
  return deletedMessage(
    screens.length === 1 && only ? quoted(only.name) : count(screens.length, 'screen'),
    transitions.length > 0 && count(transitions.length, 'transition'),
  );
}

/** "Deleted state 'Error' and 1 transition": transitions from its CTAs go with it. */
export function stateDeletionSummary(flows: Flows, screenId: string, stateId: string) {
  const screen = flows.screens.find((s) => s.id === screenId);
  const state = screen?.states.find((st) => st.id === stateId);
  if (!screen || !state || screen.states.length < 2) return null;
  const going = flows.transitions.filter(
    (t) => t.from.screenId === screenId && t.from.stateId === stateId,
  ).length;
  return deletedMessage(`state ${quoted(state.name)}`, going > 0 && count(going, 'transition'));
}

/** "Deleted 'error message'". */
export function seesDeletionSummary(
  flows: Flows,
  screenId: string,
  stateId: string,
  index: number,
) {
  const item = flows.screens.find((s) => s.id === screenId)?.states.find((st) => st.id === stateId)
    ?.sees[index];
  return item === undefined ? null : deletedMessage(quoted(item));
}

/** "Deleted CTA 'Sign in' and 1 transition". */
export function ctaDeletionSummary(flows: Flows, screenId: string, stateId: string, ctaId: string) {
  const cta = flows.screens
    .find((s) => s.id === screenId)
    ?.states.find((st) => st.id === stateId)
    ?.ctas.find((c) => c.id === ctaId);
  if (!cta) return null;
  const going = flows.transitions.filter(
    (t) => t.from.screenId === screenId && t.from.stateId === stateId && t.from.ctaId === ctaId,
  ).length;
  return deletedMessage(`CTA ${quoted(cta.label)}`, going > 0 && count(going, 'transition'));
}

/** "'Sign in' → 'Notes'". */
function describe(flows: Flows, t: Transition): string {
  const screen = (id: string) => flows.screens.find((s) => s.id === id);
  const cta = screen(t.from.screenId)
    ?.states.find((st) => st.id === t.from.stateId)
    ?.ctas.find((c) => c.id === t.from.ctaId);
  return `${quoted(cta?.label ?? '')} → ${quoted(screen(t.to.screenId)?.name ?? '')}`;
}
