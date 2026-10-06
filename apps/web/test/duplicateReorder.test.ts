import { describe, expect, it } from 'vitest';
import { Erd, Flows } from '@modelwright/schema';
import { DUPLICATE_OFFSET } from '../src/editing/reorder';
import { addEntity, addRelationship, duplicateEntities, moveAttribute } from '../src/erd/ops';
import {
  duplicateScreens,
  moveCta,
  moveSeesItem,
  moveState,
  updateTransition,
} from '../src/flows/ops';
import { notesErd, notesFlows } from './fixtures';
import { deepFreeze, must } from './helpers';

const erd = () => deepFreeze(notesErd());
const flows = () => deepFreeze(notesFlows());
const validErd = (doc: unknown) => expect(Erd.safeParse(doc).success).toBe(true);
const validFlows = (doc: unknown) => expect(Flows.safeParse(doc).success).toBe(true);

describe('duplicateEntities', () => {
  it('copies two connected entities with the link between them, offset one grid step', () => {
    const before = erd();
    const { erd: after, ids } = duplicateEntities(before, ['user', 'note']);
    validErd(after);
    expect(ids).toHaveLength(2);
    const [userCopy, noteCopy] = ids.map((id) => must(after.entities.find((e) => e.id === id)));
    expect(userCopy?.name).toBe('User');
    expect(noteCopy?.attributes.map((a) => a.name)).toEqual(['title', 'body', 'updated at']);
    // Fresh ids everywhere.
    expect(ids).not.toContain('user');
    expect(noteCopy?.attributes.some((a) => a.id.startsWith('note-'))).toBe(false);
    const copied = after.relationships.filter((r) => ids.includes(r.from));
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ from: userCopy?.id, to: noteCopy?.id, label: 'owns' });
    const at = must(before.layout.user);
    expect(after.layout[must(userCopy).id]).toEqual({
      x: at.x + DUPLICATE_OFFSET,
      y: at.y + DUPLICATE_OFFSET,
    });
  });

  it('leaves out relationships to entities outside the selection', () => {
    const { erd: after, ids } = duplicateEntities(erd(), ['user']);
    validErd(after);
    expect(after.relationships).toHaveLength(1);
    expect(after.relationships.some((r) => r.from === ids[0] || r.to === ids[0])).toBe(false);
  });

  it('copies a self-relationship', () => {
    const self = addRelationship(notesErd(), 'user', 'user').erd;
    const { erd: after, ids } = duplicateEntities(self, ['user']);
    expect(after.relationships.filter((r) => r.from === ids[0] && r.to === ids[0])).toHaveLength(1);
  });

  it('returns the same document for nothing to copy', () => {
    const before = erd();
    expect(duplicateEntities(before, ['gone']).erd).toBe(before);
  });
});

describe('duplicateScreens', () => {
  it('copies connected screens with the transitions between them', () => {
    const before = flows();
    const { flows: after, ids } = duplicateScreens(before, ['notes', 'editor']);
    validFlows(after);
    const [notesCopy, editorCopy] = ids;
    const copied = after.transitions.filter((t) => ids.includes(t.from.screenId));
    // t2 (notes → editor), t3 (notes empty → editor) and t4 (editor → notes list).
    expect(copied).toHaveLength(3);
    for (const t of copied) expect(ids).toContain(t.to.screenId);
    const back = must(copied.find((t) => t.from.screenId === editorCopy));
    const notesScreen = must(after.screens.find((s) => s.id === notesCopy));
    expect(back.to).toEqual({ screenId: notesCopy, stateId: notesScreen.states[0]?.id });
    expect(notesScreen.states.map((s) => s.name)).toEqual(['List', 'Empty']);
  });

  it("starts a lone copy's CTAs with no transitions", () => {
    const { flows: after, ids } = duplicateScreens(flows(), ['notes']);
    validFlows(after);
    expect(after.transitions).toHaveLength(4);
    expect(after.transitions.some((t) => ids.includes(t.from.screenId))).toBe(false);
    const copy = must(after.screens.find((s) => s.id === ids[0]));
    expect(copy.states[0]?.ctas.map((c) => c.label)).toEqual(['New note', 'Open note']);
    expect(copy.entities).toEqual(['note']);
  });

  it('keeps transition labels and offsets the copy', () => {
    const labelled = updateTransition(notesFlows(), 't4', { label: 'back' });
    const { flows: after, ids } = duplicateScreens(labelled, ['notes', 'editor']);
    expect(after.transitions.find((t) => t.from.screenId === ids[1])?.label).toBe('back');
    expect(after.layout[must(ids[0])]).toEqual({ x: 360 + DUPLICATE_OFFSET, y: DUPLICATE_OFFSET });
  });

  it('returns the same document for nothing to copy', () => {
    const before = flows();
    expect(duplicateScreens(before, []).flows).toBe(before);
  });
});

describe('reordering', () => {
  it('moves an attribute up and down, and not past either end', () => {
    const before = erd();
    const down = moveAttribute(before, 'note', 'note-title', 1);
    validErd(down);
    expect(must(down.entities[1]).attributes.map((a) => a.id)).toEqual([
      'note-body',
      'note-title',
      'note-updated',
    ]);
    expect(moveAttribute(before, 'note', 'note-title', -1)).toBe(before);
    expect(moveAttribute(before, 'note', 'note-updated', 1)).toBe(before);
    expect(moveAttribute(before, 'note', 'gone', 1)).toBe(before);
    expect(moveAttribute(before, 'gone', 'note-title', 1)).toBe(before);
  });

  it('moves sees items by index', () => {
    const before = flows();
    const up = moveSeesItem(before, 'login', 'login-error', 2, -1);
    validFlows(up);
    expect(up.screens[0]?.states[1]?.sees).toEqual([
      'email field',
      'error message',
      'password field',
    ]);
    expect(moveSeesItem(before, 'login', 'login-error', 0, -1)).toBe(before);
  });

  it('moves CTAs, keeping their transitions', () => {
    const before = flows();
    const after = moveCta(before, 'editor', 'editor-default', 'editor-back', -1);
    validFlows(after);
    expect(after.screens[2]?.states[0]?.ctas.map((c) => c.id)).toEqual([
      'editor-back',
      'editor-save',
    ]);
    expect(after.transitions).toBe(before.transitions);
    expect(moveCta(before, 'editor', 'editor-default', 'editor-back', 1)).toBe(before);
  });

  it('makes a state moved to the top the default', () => {
    const before = flows();
    const after = moveState(before, 'notes', 'notes-empty', -1);
    validFlows(after);
    expect(after.screens[1]?.states.map((s) => s.id)).toEqual(['notes-empty', 'notes-list']);
    // t1 has no stateId, so it now leads to the new default, as with makeDefaultState.
    expect(after.transitions.find((t) => t.id === 't1')?.to).toEqual({ screenId: 'notes' });
    expect(moveState(before, 'notes', 'notes-list', -1)).toBe(before);
    expect(moveState(before, 'editor', 'editor-default', 1)).toBe(before);
  });

  it('ignores a new entity with nothing to move', () => {
    const { erd: doc, id } = addEntity(notesErd(), { x: 0, y: 0 });
    expect(moveAttribute(doc, id, 'x', 1)).toBe(doc);
  });
});
