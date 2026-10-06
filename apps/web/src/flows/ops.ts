import type {
  Flows,
  Layout,
  Position,
  Screen,
  ScreenState,
  Transition,
  TransitionFrom,
  TransitionTo,
} from '@modelwright/schema';
import { newId } from '../editing/ids';
import { DUPLICATE_OFFSET, moveItem } from '../editing/reorder';

/**
 * Every edit to a Flows document is one of these pure functions: `(flows, …args) => flows`,
 * with no React and no I/O. Inputs are never mutated. An operation whose target no longer
 * exists returns the document unchanged (the same object), as does an edit that changes
 * nothing. A screen's `entities` cross-reference is never touched.
 */

export const NEW_SCREEN_NAME = 'Screen';
export const DEFAULT_STATE_NAME = 'Default';
export const NEW_STATE_NAME = 'State';

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

// Screens

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

export function renameScreen(flows: Flows, screenId: string, name: string): Flows {
  return mapScreen(flows, screenId, (s) => (s.name === name ? s : { ...s, name }));
}

/** Sets the notes; empty or blank notes remove the key. */
export function setScreenNotes(flows: Flows, screenId: string, notes: string): Flows {
  return mapScreen(flows, screenId, (s) => withOptional(s, 'notes', notes));
}

/** Removes the screens, every transition from or to them, and their layout entries. */
export function deleteScreens(flows: Flows, screenIds: Iterable<string>): Flows {
  const gone = new Set(screenIds);
  if (!flows.screens.some((s) => gone.has(s.id))) return flows;
  return {
    ...flows,
    screens: flows.screens.filter((s) => !gone.has(s.id)),
    transitions: flows.transitions.filter(
      (t) => !gone.has(t.from.screenId) && !gone.has(t.to.screenId),
    ),
    layout: omitKeys(flows.layout, gone),
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

// States

/**
 * Adds a state named "State" directly after `afterStateId` when given (and found), otherwise
 * at the end. It starts with a copy of the default state's sees items and no CTAs, since
 * states usually differ from the default by an item or two. Returns `id: null` if the screen
 * is gone.
 */
export function addState(
  flows: Flows,
  screenId: string,
  afterStateId?: string,
): { flows: Flows; id: string | null } {
  const screen = flows.screens.find((s) => s.id === screenId);
  if (!screen) return { flows, id: null };
  const id = newId('st', idsIn(flows));
  const state: ScreenState = {
    id,
    name: NEW_STATE_NAME,
    sees: [...(screen.states[0]?.sees ?? [])],
    ctas: [],
  };
  return {
    id,
    flows: mapScreen(flows, screenId, (s) => ({
      ...s,
      states: insertAfter(s.states, state, (st) => st.id === afterStateId),
    })),
  };
}

export function renameState(flows: Flows, screenId: string, stateId: string, name: string): Flows {
  return mapState(flows, screenId, stateId, (st) => (st.name === name ? st : { ...st, name }));
}

/**
 * Removes a state. Transitions starting from its CTAs are deleted; transitions into it are
 * retargeted to the screen's default state by dropping their `stateId`. A screen's last state
 * can't be deleted: that's a no-op.
 */
export function deleteState(flows: Flows, screenId: string, stateId: string): Flows {
  const screen = flows.screens.find((s) => s.id === screenId);
  if (!screen || screen.states.length < 2 || !screen.states.some((st) => st.id === stateId)) {
    return flows;
  }
  const transitions: Transition[] = [];
  for (const t of flows.transitions) {
    if (t.from.screenId === screenId && t.from.stateId === stateId) continue;
    if (t.to.screenId === screenId && t.to.stateId === stateId) {
      transitions.push({ ...t, to: { screenId } });
    } else {
      transitions.push(t);
    }
  }
  return {
    ...mapScreen(flows, screenId, (s) => ({
      ...s,
      states: s.states.filter((st) => st.id !== stateId),
    })),
    transitions,
  };
}

/**
 * Makes a state the default by moving it to first place; the others keep their order.
 * Transitions without a `stateId` follow the default, so they now lead to this state.
 */
export function makeDefaultState(flows: Flows, screenId: string, stateId: string): Flows {
  return mapScreen(flows, screenId, (s) => {
    const index = s.states.findIndex((st) => st.id === stateId);
    if (index <= 0) return s;
    const state = s.states[index] as ScreenState;
    return { ...s, states: [state, ...s.states.filter((st) => st.id !== stateId)] };
  });
}

// Sees items: plain strings, addressed by index.

/**
 * Inserts a sees item directly after `afterIndex` when given (and in range), otherwise at the
 * end. Returns its index, or null if the state is gone.
 */
export function addSeesItem(
  flows: Flows,
  screenId: string,
  stateId: string,
  afterIndex?: number,
  text = '',
): { flows: Flows; index: number | null } {
  let index: number | null = null;
  const next = mapState(flows, screenId, stateId, (st) => {
    index =
      afterIndex !== undefined && afterIndex >= 0 && afterIndex < st.sees.length
        ? afterIndex + 1
        : st.sees.length;
    return { ...st, sees: [...st.sees.slice(0, index), text, ...st.sees.slice(index)] };
  });
  return { flows: next, index };
}

export function updateSeesItem(
  flows: Flows,
  screenId: string,
  stateId: string,
  index: number,
  text: string,
): Flows {
  return mapState(flows, screenId, stateId, (st) =>
    index < 0 || index >= st.sees.length || st.sees[index] === text
      ? st
      : { ...st, sees: st.sees.map((item, i) => (i === index ? text : item)) },
  );
}

export function deleteSeesItem(
  flows: Flows,
  screenId: string,
  stateId: string,
  index: number,
): Flows {
  return mapState(flows, screenId, stateId, (st) =>
    index < 0 || index >= st.sees.length
      ? st
      : { ...st, sees: st.sees.filter((_, i) => i !== index) },
  );
}

// CTAs

/**
 * Adds a CTA directly after `afterCtaId` when given (and found), otherwise at the end.
 * Returns its id, or null if the state is gone.
 */
export function addCta(
  flows: Flows,
  screenId: string,
  stateId: string,
  afterCtaId?: string,
  label = '',
): { flows: Flows; id: string | null } {
  const id = newId('cta', idsIn(flows));
  const next = mapState(flows, screenId, stateId, (st) => ({
    ...st,
    ctas: insertAfter(st.ctas, { id, label }, (c) => c.id === afterCtaId),
  }));
  return next === flows ? { flows, id: null } : { flows: next, id };
}

export function renameCta(
  flows: Flows,
  screenId: string,
  stateId: string,
  ctaId: string,
  label: string,
): Flows {
  return mapState(flows, screenId, stateId, (st) => {
    if (!st.ctas.some((c) => c.id === ctaId && c.label !== label)) return st;
    return { ...st, ctas: st.ctas.map((c) => (c.id === ctaId ? { ...c, label } : c)) };
  });
}

/** Removes a CTA and every transition starting from it. */
export function deleteCta(flows: Flows, screenId: string, stateId: string, ctaId: string): Flows {
  const next = mapState(flows, screenId, stateId, (st) =>
    st.ctas.some((c) => c.id === ctaId)
      ? { ...st, ctas: st.ctas.filter((c) => c.id !== ctaId) }
      : st,
  );
  if (next === flows) return flows;
  return {
    ...next,
    transitions: next.transitions.filter(
      (t) =>
        !(t.from.screenId === screenId && t.from.stateId === stateId && t.from.ctaId === ctaId),
    ),
  };
}

// Transitions

/**
 * Adds a transition from a CTA to a screen, or to one of its states when `to.stateId` is set.
 * Returns `id: null`, and the document unchanged, if either end doesn't exist.
 */
export function addTransition(
  flows: Flows,
  from: TransitionFrom,
  to: TransitionTo,
): { flows: Flows; id: string | null } {
  if (!ctaExists(flows, from) || !targetExists(flows, to)) return { flows, id: null };
  const id = newId('tr', idsIn(flows));
  const transition: Transition = {
    id,
    from: { screenId: from.screenId, stateId: from.stateId, ctaId: from.ctaId },
    to: to.stateId === undefined ? { screenId: to.screenId } : { ...to },
  };
  return { id, flows: { ...flows, transitions: [...flows.transitions, transition] } };
}

/**
 * Changes a transition's label (blank removes it) and/or its target state within the same
 * screen: a state id targets that state, null targets the screen's default state. A state
 * that isn't on the target screen is ignored.
 */
export function updateTransition(
  flows: Flows,
  transitionId: string,
  changes: { label?: string; stateId?: string | null },
): Flows {
  let changed = false;
  const transitions = flows.transitions.map((t) => {
    if (t.id !== transitionId) return t;
    let next = t;
    if (changes.label !== undefined) next = withOptional(next, 'label', changes.label);
    if (changes.stateId !== undefined && changes.stateId !== (t.to.stateId ?? null)) {
      if (changes.stateId === null) {
        next = { ...next, to: { screenId: t.to.screenId } };
      } else if (targetExists(flows, { screenId: t.to.screenId, stateId: changes.stateId })) {
        next = { ...next, to: { screenId: t.to.screenId, stateId: changes.stateId } };
      }
    }
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { ...flows, transitions } : flows;
}

export function deleteTransitions(flows: Flows, transitionIds: Iterable<string>): Flows {
  const gone = new Set(transitionIds);
  if (!flows.transitions.some((t) => gone.has(t.id))) return flows;
  return { ...flows, transitions: flows.transitions.filter((t) => !gone.has(t.id)) };
}

// Reordering and duplicating

/**
 * Moves a state `offset` places within its screen. The first state is the default, so moving
 * one to the top makes it the default, as `makeDefaultState` does.
 */
export function moveState(flows: Flows, screenId: string, stateId: string, offset: number): Flows {
  return mapScreen(flows, screenId, (s) => {
    const states = moveItem(
      s.states,
      s.states.findIndex((st) => st.id === stateId),
      offset,
    );
    return states ? { ...s, states } : s;
  });
}

/** Moves the sees item at `index` by `offset` places. */
export function moveSeesItem(
  flows: Flows,
  screenId: string,
  stateId: string,
  index: number,
  offset: number,
): Flows {
  return mapState(flows, screenId, stateId, (st) => {
    const sees = moveItem(st.sees, index, offset);
    return sees ? { ...st, sees } : st;
  });
}

/** Moves a CTA `offset` places within its state. Its transitions go with it. */
export function moveCta(
  flows: Flows,
  screenId: string,
  stateId: string,
  ctaId: string,
  offset: number,
): Flows {
  return mapState(flows, screenId, stateId, (st) => {
    const ctas = moveItem(
      st.ctas,
      st.ctas.findIndex((c) => c.id === ctaId),
      offset,
    );
    return ctas ? { ...st, ctas } : st;
  });
}

/**
 * Copies the screens with fresh ids (states and CTAs included), one grid step down and right
 * of the originals, keeping their names. A transition is copied only when both its ends are
 * copied screens, so a copy's CTAs have no transitions out of the copied set. Returns the
 * copies' ids in order.
 */
export function duplicateScreens(
  flows: Flows,
  screenIds: Iterable<string>,
): { flows: Flows; ids: string[] } {
  const chosen = new Set(screenIds);
  const originals = flows.screens.filter((s) => chosen.has(s.id));
  if (originals.length === 0) return { flows, ids: [] };

  const taken = idsIn(flows);
  const fresh = (prefix: 'scr' | 'st' | 'cta' | 'tr') => {
    const id = newId(prefix, taken);
    taken.add(id);
    return id;
  };
  /** Old id → new id, per kind (state and CTA ids are only unique within their parent). */
  const screenCopy = new Map<string, string>();
  const stateCopy = new Map<string, string>();
  const ctaCopy = new Map<string, string>();
  const key = (...parts: string[]) => parts.join('\u0000');

  const layout: Layout = { ...flows.layout };
  const copies = originals.map((s): Screen => {
    const id = fresh('scr');
    screenCopy.set(s.id, id);
    const at = flows.layout[s.id];
    if (at) layout[id] = { x: at.x + DUPLICATE_OFFSET, y: at.y + DUPLICATE_OFFSET };
    return {
      ...s,
      id,
      states: s.states.map((st) => {
        const stateId = fresh('st');
        stateCopy.set(key(s.id, st.id), stateId);
        return {
          ...st,
          id: stateId,
          ctas: st.ctas.map((c) => {
            const ctaId = fresh('cta');
            ctaCopy.set(key(s.id, st.id, c.id), ctaId);
            return { ...c, id: ctaId };
          }),
        };
      }),
    };
  });

  const transitions = flows.transitions.flatMap((t): Transition[] => {
    const fromScreen = screenCopy.get(t.from.screenId);
    const toScreen = screenCopy.get(t.to.screenId);
    const fromState = stateCopy.get(key(t.from.screenId, t.from.stateId));
    const fromCta = ctaCopy.get(key(t.from.screenId, t.from.stateId, t.from.ctaId));
    if (!fromScreen || !toScreen || !fromState || !fromCta) return [];
    const toState =
      t.to.stateId === undefined ? undefined : stateCopy.get(key(t.to.screenId, t.to.stateId));
    return [
      {
        ...t,
        id: fresh('tr'),
        from: { screenId: fromScreen, stateId: fromState, ctaId: fromCta },
        to:
          toState === undefined ? { screenId: toScreen } : { screenId: toScreen, stateId: toState },
      },
    ];
  });

  return {
    ids: copies.map((c) => c.id),
    flows: {
      ...flows,
      screens: [...flows.screens, ...copies],
      transitions: [...flows.transitions, ...transitions],
      layout,
    },
  };
}

// Helpers

function ctaExists(flows: Flows, from: TransitionFrom): boolean {
  return flows.screens.some(
    (s) =>
      s.id === from.screenId &&
      s.states.some((st) => st.id === from.stateId && st.ctas.some((c) => c.id === from.ctaId)),
  );
}

function targetExists(flows: Flows, to: TransitionTo): boolean {
  const screen = flows.screens.find((s) => s.id === to.screenId);
  return (
    screen !== undefined &&
    (to.stateId === undefined || screen.states.some((st) => st.id === to.stateId))
  );
}

function mapScreen(flows: Flows, screenId: string, change: (s: Screen) => Screen): Flows {
  let changed = false;
  const screens = flows.screens.map((s) => {
    if (s.id !== screenId) return s;
    const next = change(s);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...flows, screens } : flows;
}

function mapState(
  flows: Flows,
  screenId: string,
  stateId: string,
  change: (st: ScreenState) => ScreenState,
): Flows {
  return mapScreen(flows, screenId, (s) => {
    let changed = false;
    const states = s.states.map((st) => {
      if (st.id !== stateId) return st;
      const next = change(st);
      if (next !== st) changed = true;
      return next;
    });
    return changed ? { ...s, states } : s;
  });
}

/** Inserts `item` after the first element matching `isAfter`, or at the end if none does. */
function insertAfter<T>(items: readonly T[], item: T, isAfter: (t: T) => boolean): T[] {
  const after = items.findIndex(isAfter);
  const at = after === -1 ? items.length : after + 1;
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** Sets an optional string field, removing the key when the value is blank. */
function withOptional<T extends object, K extends keyof T & string>(
  obj: T,
  key: K,
  value: string,
): T {
  const current = (obj as Record<string, unknown>)[key];
  if (value.trim() === '') {
    if (current === undefined) return obj;
    return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as T;
  }
  return current === value ? obj : { ...obj, [key]: value };
}

function omitKeys(layout: Layout, keys: ReadonlySet<string>): Layout {
  const out: Layout = {};
  for (const [id, position] of Object.entries(layout)) {
    if (!keys.has(id)) out[id] = position;
  }
  return out;
}

function roundPosition({ x, y }: Position): Position {
  return { x: Math.round(x), y: Math.round(y) };
}
