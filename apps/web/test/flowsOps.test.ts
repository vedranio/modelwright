import { describe, expect, it } from 'vitest';
import { Flows } from '@modelwright/schema';
import {
  DEFAULT_STATE_NAME,
  NEW_SCREEN_NAME,
  NEW_STATE_NAME,
  addCta,
  addScreen,
  addScreenWithTransition,
  addSeesItem,
  addState,
  addTransition,
  deleteCta,
  duplicateScreens,
  setPrimaryCta,
  setStateNotes,
  deleteScreens,
  deleteSeesItem,
  deleteState,
  deleteTransitions,
  idsIn,
  leadsToOwnState,
  makeDefaultState,
  moveScreens,
  renameCta,
  renameScreen,
  renameState,
  retargetTransition,
  setScreenNotes,
  updateSeesItem,
  updateTransition,
} from '../src/flows/ops';
import { notesFlows } from './fixtures';
import { deepFreeze, must } from './helpers';

/** A frozen copy of the notes fixture: any mutation by an op throws. */
const frozen = () => deepFreeze(notesFlows());

/** Every op result must still be a valid Flows document. */
function valid(flows: Flows): Flows {
  const result = Flows.safeParse(flows);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return flows;
}

const screen = (f: Flows, id: string) =>
  must(
    f.screens.find((s) => s.id === id),
    id,
  );
const state = (f: Flows, screenId: string, id: string) =>
  must(
    screen(f, screenId).states.find((s) => s.id === id),
    id,
  );
const transition = (f: Flows, id: string) =>
  must(
    f.transitions.find((t) => t.id === id),
    id,
  );
const transitionIds = (f: Flows) => f.transitions.map((t) => t.id);

const EMPTY: Flows = { schemaVersion: 2, screens: [], transitions: [], layout: {} };

describe('idsIn', () => {
  it('collects screen, state, CTA and transition ids', () => {
    const ids = idsIn(notesFlows());
    for (const id of ['login', 'login-error', 'notes-open', 't4']) expect(ids.has(id)).toBe(true);
    expect(ids.size).toBe(3 + 5 + 7 + 4);
  });
});

describe('addScreen', () => {
  it('adds "Screen" with one empty "Default" state at the rounded position', () => {
    const { flows, id } = addScreen(frozen(), { x: 10.4, y: -3.6 });
    valid(flows);
    expect(id).toMatch(/^scr_[0-9a-z]{8}$/);
    const s = screen(flows, id);
    expect(s.name).toBe(NEW_SCREEN_NAME);
    expect(s.states).toHaveLength(1);
    expect(s.states[0]).toMatchObject({ name: DEFAULT_STATE_NAME, sees: [], ctas: [] });
    expect(s.states[0]?.id).toMatch(/^st_[0-9a-z]{8}$/);
    expect(flows.layout[id]).toEqual({ x: 10, y: -4 });
  });

  it('works on an empty document', () => {
    expect(
      valid(addScreen(deepFreeze(structuredClone(EMPTY)), { x: 0, y: 0 }).flows).screens,
    ).toHaveLength(1);
  });
});

describe('renameScreen / setScreenNotes', () => {
  it('renames, and returns the same object when unchanged or missing', () => {
    const f = frozen();
    expect(screen(valid(renameScreen(f, 'login', 'Sign in')), 'login').name).toBe('Sign in');
    expect(renameScreen(f, 'login', 'Login')).toBe(f);
    expect(renameScreen(f, 'nope', 'X')).toBe(f);
  });

  it('sets notes and removes the key when blank', () => {
    const f = frozen();
    const withNotes = valid(setScreenNotes(f, 'login', 'First thing users see'));
    expect(screen(withNotes, 'login').notes).toBe('First thing users see');
    const cleared = valid(setScreenNotes(withNotes, 'login', '   '));
    expect('notes' in screen(cleared, 'login')).toBe(false);
    expect(setScreenNotes(f, 'login', '')).toBe(f);
  });
});

describe('deleteScreens', () => {
  it('cascades to transitions from and to the screen, and its layout entry', () => {
    const f = valid(deleteScreens(frozen(), ['notes']));
    expect(f.screens.map((s) => s.id)).toEqual(['login', 'editor']);
    // t1 → notes, t2 and t3 from notes, t4 → notes: all gone.
    expect(f.transitions).toEqual([]);
    expect(f.layout.notes).toBeUndefined();
  });

  it('keeps unrelated transitions', () => {
    const f = valid(deleteScreens(frozen(), ['login']));
    expect(transitionIds(f)).toEqual(['t2', 't3', 't4']);
  });

  it('is a no-op for unknown ids', () => {
    const f = frozen();
    expect(deleteScreens(f, ['nope'])).toBe(f);
  });
});

describe('moveScreens', () => {
  it('rounds positions and ignores unknown or unchanged ones', () => {
    const f = frozen();
    const moved = valid(moveScreens(f, { login: { x: 5.5, y: 9.2 }, nope: { x: 1, y: 1 } }));
    expect(moved.layout.login).toEqual({ x: 6, y: 9 });
    expect(moved.layout.nope).toBeUndefined();
    expect(moveScreens(f, { login: { x: 0, y: 0.2 } })).toBe(f);
  });
});

describe('addState', () => {
  it('appends "State" with a copy of the default state’s sees and no CTAs', () => {
    const { flows, id } = addState(frozen(), 'login');
    valid(flows);
    const s = screen(flows, 'login');
    expect(s.states.map((st) => st.id)).toEqual(['login-default', 'login-error', id]);
    expect(state(flows, 'login', must(id))).toEqual({
      id,
      name: NEW_STATE_NAME,
      sees: ['email field', 'password field'],
      ctas: [],
    });
  });

  it('inserts after the given state', () => {
    const { flows, id } = addState(frozen(), 'login', 'login-default');
    expect(screen(valid(flows), 'login').states.map((st) => st.id)).toEqual([
      'login-default',
      id,
      'login-error',
    ]);
  });

  it('copies rather than shares the sees array', () => {
    const { flows, id } = addState(notesFlows(), 'login');
    expect(state(flows, 'login', must(id)).sees).not.toBe(
      state(flows, 'login', 'login-default').sees,
    );
  });

  it('returns id null for a missing screen', () => {
    const f = frozen();
    expect(addState(f, 'nope')).toEqual({ flows: f, id: null });
  });
});

describe('renameState', () => {
  it('renames, with same-object returns when unchanged or missing', () => {
    const f = frozen();
    expect(
      state(valid(renameState(f, 'login', 'login-error', 'Failed')), 'login', 'login-error').name,
    ).toBe('Failed');
    expect(renameState(f, 'login', 'login-error', 'Error')).toBe(f);
    expect(renameState(f, 'login', 'nope', 'X')).toBe(f);
  });
});

describe('deleteState', () => {
  it('deletes transitions from its CTAs and retargets transitions into it to the default', () => {
    let f = notesFlows();
    // A transition out of Notes › Empty already exists (t3); add one into it as well.
    const added = addTransition(
      f,
      { screenId: 'editor', stateId: 'editor-default', ctaId: 'editor-save' },
      { screenId: 'notes', stateId: 'notes-empty' },
    );
    f = deepFreeze(added.flows);
    const result = valid(deleteState(f, 'notes', 'notes-empty'));
    expect(screen(result, 'notes').states.map((s) => s.id)).toEqual(['notes-list']);
    expect(transitionIds(result)).not.toContain('t3');
    expect(transition(result, must(added.id)).to).toEqual({ screenId: 'notes' });
    // Untouched: t4 still targets Notes › List explicitly.
    expect(transition(result, 't4').to).toEqual({ screenId: 'notes', stateId: 'notes-list' });
  });

  it('refuses to delete a screen’s last state', () => {
    const f = frozen();
    expect(deleteState(f, 'editor', 'editor-default')).toBe(f);
  });

  it('is a no-op for a missing screen or state', () => {
    const f = frozen();
    expect(deleteState(f, 'nope', 'login-error')).toBe(f);
    expect(deleteState(f, 'login', 'nope')).toBe(f);
  });

  it('deleting the default makes the next state the default', () => {
    const f = valid(deleteState(frozen(), 'login', 'login-default'));
    expect(screen(f, 'login').states.map((s) => s.id)).toEqual(['login-error']);
    expect(transitionIds(f)).not.toContain('t1');
  });
});

describe('makeDefaultState', () => {
  it('moves the state to first place, keeping the others in order', () => {
    let f = addState(notesFlows(), 'login').flows;
    const third = must(screen(f, 'login').states[2]).id;
    f = deepFreeze(f);
    const result = valid(makeDefaultState(f, 'login', third));
    expect(screen(result, 'login').states.map((s) => s.id)).toEqual([
      third,
      'login-default',
      'login-error',
    ]);
  });

  it('leaves transitions alone: those without stateId now lead to the new default', () => {
    const f = valid(makeDefaultState(frozen(), 'notes', 'notes-empty'));
    expect(transition(f, 't1').to).toEqual({ screenId: 'notes' });
    expect(transition(f, 't4').to).toEqual({ screenId: 'notes', stateId: 'notes-list' });
  });

  it('is a no-op for the current default or a missing state', () => {
    const f = frozen();
    expect(makeDefaultState(f, 'login', 'login-default')).toBe(f);
    expect(makeDefaultState(f, 'login', 'nope')).toBe(f);
  });
});

describe('sees items', () => {
  it('adds at the end, or after an index, and returns the index', () => {
    const f = frozen();
    const end = addSeesItem(f, 'login', 'login-default');
    expect(end.index).toBe(2);
    expect(state(valid(end.flows), 'login', 'login-default').sees).toEqual([
      'email field',
      'password field',
      '',
    ]);
    const mid = addSeesItem(f, 'login', 'login-default', 0, 'logo');
    expect(mid.index).toBe(1);
    expect(state(mid.flows, 'login', 'login-default').sees).toEqual([
      'email field',
      'logo',
      'password field',
    ]);
  });

  it('returns index null for a missing state', () => {
    const f = frozen();
    expect(addSeesItem(f, 'login', 'nope')).toEqual({ flows: f, index: null });
  });

  it('updates by index, with same-object returns', () => {
    const f = frozen();
    expect(
      state(
        valid(updateSeesItem(f, 'login', 'login-default', 1, 'password')),
        'login',
        'login-default',
      ).sees[1],
    ).toBe('password');
    expect(updateSeesItem(f, 'login', 'login-default', 1, 'password field')).toBe(f);
    expect(updateSeesItem(f, 'login', 'login-default', 9, 'x')).toBe(f);
  });

  it('deletes by index', () => {
    const f = frozen();
    expect(
      state(valid(deleteSeesItem(f, 'login', 'login-default', 0)), 'login', 'login-default').sees,
    ).toEqual(['password field']);
    expect(deleteSeesItem(f, 'login', 'login-default', 5)).toBe(f);
  });
});

describe('CTAs', () => {
  it('adds at the end or after a CTA, and returns its id', () => {
    const f = frozen();
    const end = addCta(f, 'notes', 'notes-list');
    valid(end.flows);
    expect(end.id).toMatch(/^cta_[0-9a-z]{8}$/);
    expect(state(end.flows, 'notes', 'notes-list').ctas.map((c) => c.id)).toEqual([
      'notes-new',
      'notes-open',
      end.id,
    ]);
    const mid = addCta(f, 'notes', 'notes-list', 'notes-new', 'Search');
    expect(state(mid.flows, 'notes', 'notes-list').ctas).toEqual([
      { id: 'notes-new', label: 'New note' },
      { id: mid.id, label: 'Search' },
      { id: 'notes-open', label: 'Open note' },
    ]);
  });

  it('returns id null for a missing state', () => {
    const f = frozen();
    expect(addCta(f, 'notes', 'nope')).toEqual({ flows: f, id: null });
  });

  it('renames, with same-object returns', () => {
    const f = frozen();
    const renamed = valid(renameCta(f, 'login', 'login-default', 'login-submit', 'Log in'));
    expect(state(renamed, 'login', 'login-default').ctas[0]?.label).toBe('Log in');
    expect(renameCta(f, 'login', 'login-default', 'login-submit', 'Sign in')).toBe(f);
    expect(renameCta(f, 'login', 'login-default', 'nope', 'X')).toBe(f);
  });

  it('deleting a CTA deletes the transitions starting from it', () => {
    const f = valid(deleteCta(frozen(), 'login', 'login-default', 'login-submit'));
    expect(state(f, 'login', 'login-default').ctas).toEqual([]);
    expect(transitionIds(f)).toEqual(['t2', 't3', 't4']);
    const g = frozen();
    expect(deleteCta(g, 'login', 'login-default', 'nope')).toBe(g);
  });
});

describe('transitions', () => {
  const from = { screenId: 'login', stateId: 'login-error', ctaId: 'login-retry' };

  it('adds a transition to a screen (no stateId) or a specific state', () => {
    const toScreen = addTransition(frozen(), from, { screenId: 'login' });
    expect(toScreen.id).toMatch(/^tr_[0-9a-z]{8}$/);
    expect(transition(valid(toScreen.flows), must(toScreen.id))).toEqual({
      id: toScreen.id,
      from,
      to: { screenId: 'login' },
    });
    const toState = addTransition(frozen(), from, { screenId: 'login', stateId: 'login-error' });
    expect(transition(valid(toState.flows), must(toState.id)).to).toEqual({
      screenId: 'login',
      stateId: 'login-error',
    });
  });

  it('allows several transitions from one CTA', () => {
    let f = addTransition(
      notesFlows(),
      { screenId: 'login', stateId: 'login-default', ctaId: 'login-submit' },
      { screenId: 'login', stateId: 'login-error' },
    ).flows;
    f = valid(f);
    expect(f.transitions.filter((t) => t.from.ctaId === 'login-submit')).toHaveLength(2);
  });

  it('refuses missing ends', () => {
    const f = frozen();
    expect(addTransition(f, { ...from, ctaId: 'nope' }, { screenId: 'login' })).toEqual({
      flows: f,
      id: null,
    });
    expect(addTransition(f, from, { screenId: 'nope' })).toEqual({ flows: f, id: null });
    expect(addTransition(f, from, { screenId: 'notes', stateId: 'login-error' })).toEqual({
      flows: f,
      id: null,
    });
  });

  it('updates the label, removing it when blank', () => {
    const f = frozen();
    const labelled = valid(updateTransition(f, 't1', { label: 'success' }));
    expect(transition(labelled, 't1').label).toBe('success');
    expect(
      'label' in transition(valid(updateTransition(labelled, 't1', { label: ' ' })), 't1'),
    ).toBe(false);
    expect(updateTransition(f, 't1', { label: '' })).toBe(f);
    expect(updateTransition(f, 'nope', { label: 'x' })).toBe(f);
  });

  it('switches between the default state and a specific state of the same screen', () => {
    const f = frozen();
    const specific = valid(updateTransition(f, 't1', { stateId: 'notes-empty' }));
    expect(transition(specific, 't1').to).toEqual({ screenId: 'notes', stateId: 'notes-empty' });
    const back = valid(updateTransition(specific, 't1', { stateId: null }));
    expect(transition(back, 't1').to).toEqual({ screenId: 'notes' });
    expect(updateTransition(f, 't1', { stateId: null })).toBe(f);
    // A state on another screen is ignored.
    expect(updateTransition(f, 't1', { stateId: 'login-error' })).toBe(f);
  });

  it('retargets a transition to any screen or state, keeping its id, source and label', () => {
    const f = valid(updateTransition(frozen(), 't2', { label: 'new' }));
    const toLogin = valid(retargetTransition(f, 't2', { screenId: 'login' }));
    expect(transition(toLogin, 't2')).toEqual({
      ...transition(f, 't2'),
      to: { screenId: 'login' },
    });
    const toState = valid(
      retargetTransition(toLogin, 't2', { screenId: 'login', stateId: 'login-error' }),
    );
    expect(transition(toState, 't2').to).toEqual({ screenId: 'login', stateId: 'login-error' });
    // Within the same screen, to another state.
    expect(
      transition(
        valid(retargetTransition(f, 't2', { screenId: 'notes', stateId: 'notes-empty' })),
        't2',
      ).to,
    ).toEqual({ screenId: 'notes', stateId: 'notes-empty' });
  });

  it('leaves a transition alone when the target is unknown, unchanged or its own state', () => {
    const f = frozen();
    expect(retargetTransition(f, 't2', { screenId: 'nope' })).toBe(f);
    expect(retargetTransition(f, 't2', { screenId: 'login', stateId: 'notes-empty' })).toBe(f);
    expect(retargetTransition(f, 't2', { screenId: 'editor' })).toBe(f);
    expect(retargetTransition(f, 'nope', { screenId: 'login' })).toBe(f);
    // t2 starts in Notes › List, the Notes default state, so neither form of it is allowed.
    expect(retargetTransition(f, 't2', { screenId: 'notes' })).toBe(f);
    expect(retargetTransition(f, 't2', { screenId: 'notes', stateId: 'notes-list' })).toBe(f);
  });

  it('knows a transition can’t lead into the state its CTA sits in', () => {
    const f = frozen();
    const from = { screenId: 'notes', stateId: 'notes-empty', ctaId: 'notes-empty-new' };
    expect(leadsToOwnState(f, from, { screenId: 'notes', stateId: 'notes-empty' })).toBe(true);
    expect(leadsToOwnState(f, from, { screenId: 'notes' })).toBe(false);
    expect(leadsToOwnState(f, from, { screenId: 'editor' })).toBe(false);
  });

  it('deletes transitions', () => {
    const f = frozen();
    expect(transitionIds(valid(deleteTransitions(f, ['t1', 't3'])))).toEqual(['t2', 't4']);
    expect(deleteTransitions(f, ['nope'])).toBe(f);
  });
});

describe('entities cross-reference', () => {
  it('survives every operation on its screen', () => {
    const ops: ((f: Flows) => Flows)[] = [
      (f) => renameScreen(f, 'notes', 'All notes'),
      (f) => setScreenNotes(f, 'notes', 'Home'),
      (f) => moveScreens(f, { notes: { x: 1, y: 2 } }),
      (f) => addState(f, 'notes').flows,
      (f) => renameState(f, 'notes', 'notes-list', 'Items'),
      (f) => deleteState(f, 'notes', 'notes-empty'),
      (f) => makeDefaultState(f, 'notes', 'notes-empty'),
      (f) => addSeesItem(f, 'notes', 'notes-list', 0, 'search').flows,
      (f) => updateSeesItem(f, 'notes', 'notes-list', 0, 'titles'),
      (f) => deleteSeesItem(f, 'notes', 'notes-list', 0),
      (f) => addCta(f, 'notes', 'notes-list', undefined, 'Search').flows,
      (f) => renameCta(f, 'notes', 'notes-list', 'notes-new', 'Add'),
      (f) => deleteCta(f, 'notes', 'notes-list', 'notes-new'),
      (f) =>
        addTransition(
          f,
          { screenId: 'notes', stateId: 'notes-list', ctaId: 'notes-open' },
          { screenId: 'editor' },
        ).flows,
    ];
    for (const op of ops) {
      const result = valid(op(frozen()));
      expect(screen(result, 'notes').entities).toEqual(['note']);
    }
  });
});

describe('addScreenWithTransition', () => {
  const from = { screenId: 'notes', stateId: 'notes-list', ctaId: 'notes-open' };

  it('adds a screen and a transition to it from the CTA, in one edit', () => {
    const before = notesFlows();
    const { flows, screenId, transitionId } = addScreenWithTransition(
      before,
      { x: 900.4, y: 40 },
      from,
    );
    expect(Flows.safeParse(flows).success).toBe(true);
    expect(flows.screens.at(-1)?.id).toBe(screenId);
    expect(flows.layout[screenId ?? '']).toEqual({ x: 900, y: 40 });
    expect(flows.transitions.at(-1)).toEqual({ id: transitionId, from, to: { screenId } });
  });

  it('changes nothing for a CTA that doesn’t exist', () => {
    const before = notesFlows();
    const result = addScreenWithTransition(before, { x: 0, y: 0 }, { ...from, ctaId: 'gone' });
    expect(result).toEqual({ flows: before, screenId: null, transitionId: null });
  });
});

describe('state notes and the primary CTA (schema v2)', () => {
  const valid = (f: Flows) => expect(Flows.safeParse(f).success).toBe(true);
  const notesList = (f: Flows) => must(must(f.screens[1]).states[0]);

  it('sets, changes and clears a state’s notes', () => {
    const before = deepFreeze(notesFlows());
    const withNotes = setStateNotes(before, 'notes', 'notes-list', 'Newest first');
    valid(withNotes);
    expect(notesList(withNotes).notes).toBe('Newest first');
    expect(setStateNotes(withNotes, 'notes', 'notes-list', 'Newest first')).toBe(withNotes);
    expect('notes' in notesList(setStateNotes(withNotes, 'notes', 'notes-list', ' '))).toBe(false);
  });

  it('marks one primary CTA per state, replacing the last, and unsets it', () => {
    const before = deepFreeze(notesFlows());
    const one = setPrimaryCta(before, 'notes', 'notes-list', 'notes-new');
    valid(one);
    expect(notesList(one).primaryCtaId).toBe('notes-new');
    const other = setPrimaryCta(one, 'notes', 'notes-list', 'notes-open');
    expect(notesList(other).primaryCtaId).toBe('notes-open');
    expect('primaryCtaId' in notesList(setPrimaryCta(other, 'notes', 'notes-list', null))).toBe(
      false,
    );
  });

  it('ignores a CTA that isn’t in the state', () => {
    const before = deepFreeze(notesFlows());
    expect(setPrimaryCta(before, 'notes', 'notes-list', 'login-submit')).toBe(before);
  });

  it('drops the mark when the primary CTA is deleted', () => {
    const marked = setPrimaryCta(notesFlows(), 'notes', 'notes-list', 'notes-new');
    const after = deleteCta(marked, 'notes', 'notes-list', 'notes-new');
    valid(after);
    expect('primaryCtaId' in notesList(after)).toBe(false);
  });

  it('carries the mark to a duplicated screen’s copy of the CTA', () => {
    const marked = setPrimaryCta(notesFlows(), 'notes', 'notes-list', 'notes-new');
    const { flows: after, ids } = duplicateScreens(marked, ['notes']);
    valid(after);
    const copy = must(after.screens.find((s) => s.id === ids[0]));
    const state = must(copy.states[0]);
    expect(state.primaryCtaId).toBe(state.ctas[0]?.id);
    expect(state.primaryCtaId).not.toBe('notes-new');
  });
});
