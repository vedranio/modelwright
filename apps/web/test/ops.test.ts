import { describe, expect, it } from 'vitest';
import { Erd } from '@modelwright/schema';
import {
  NEW_ENTITY_NAME,
  addAttribute,
  addEntity,
  addRelationship,
  deleteAttribute,
  deleteEntities,
  deleteRelationships,
  moveEntities,
  renameEntity,
  reverseRelationship,
  setEntityDescription,
  updateAttribute,
  updateRelationship,
} from '../src/erd/ops';
import { notesErd } from './fixtures';
import { deepFreeze, must } from './helpers';

/** A frozen copy of the notes fixture: any mutation by an op throws. */
const frozen = () => deepFreeze(notesErd());

/** Every op result must still be a valid ERD. */
function valid(erd: Erd): Erd {
  const result = Erd.safeParse(erd);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return erd;
}

const entity = (erd: Erd, id: string) =>
  must(
    erd.entities.find((e) => e.id === id),
    id,
  );
const rel = (erd: Erd, id: string) =>
  must(
    erd.relationships.find((r) => r.id === id),
    id,
  );

describe('addEntity', () => {
  it('adds an empty "Entity" at the position and returns its id', () => {
    const { erd, id } = addEntity(frozen(), { x: 12.6, y: -40.2 });
    valid(erd);
    expect(id).toMatch(/^ent_[0-9a-z]{8}$/);
    expect(entity(erd, id)).toEqual({ id, name: NEW_ENTITY_NAME, attributes: [] });
    expect(erd.layout[id]).toEqual({ x: 13, y: -40 });
    expect(erd.entities.at(-1)?.id).toBe(id);
  });

  it('works on an empty document', () => {
    const empty = deepFreeze<Erd>({
      schemaVersion: 1,
      entities: [],
      relationships: [],
      layout: {},
    });
    const { erd } = addEntity(empty, { x: 0, y: 0 });
    expect(valid(erd).entities).toHaveLength(1);
  });
});

describe('renameEntity and setEntityDescription', () => {
  it('renames', () => {
    const erd = valid(renameEntity(frozen(), 'user', 'Account'));
    expect(entity(erd, 'user').name).toBe('Account');
  });

  it('returns the same document when nothing changes or the entity is gone', () => {
    const doc = frozen();
    expect(renameEntity(doc, 'user', 'User')).toBe(doc);
    expect(renameEntity(doc, 'nope', 'X')).toBe(doc);
  });

  it('sets a description and removes it when blank', () => {
    const withDesc = valid(setEntityDescription(frozen(), 'note', 'Something written down'));
    expect(entity(withDesc, 'note').description).toBe('Something written down');
    const cleared = valid(setEntityDescription(deepFreeze(withDesc), 'note', '   '));
    expect('description' in entity(cleared, 'note')).toBe(false);
  });
});

describe('deleteEntities', () => {
  it('removes the entity, its relationships and its layout entry', () => {
    const erd = valid(deleteEntities(frozen(), ['user']));
    expect(erd.entities.map((e) => e.id)).toEqual(['note']);
    expect(erd.relationships).toEqual([]);
    expect(Object.keys(erd.layout)).toEqual(['note']);
  });

  it('removes several at once and keeps relationships between survivors', () => {
    let doc = frozen();
    const a = addEntity(doc, { x: 0, y: 300 });
    doc = deepFreeze(a.erd);
    const r = addRelationship(doc, 'note', a.id);
    doc = deepFreeze(r.erd);
    const erd = valid(deleteEntities(doc, ['user']));
    expect(erd.relationships.map((x) => x.id)).toEqual([r.id]);
    expect(valid(deleteEntities(doc, ['user', 'note', a.id])).entities).toEqual([]);
  });

  it('removes a self-relationship with its entity', () => {
    const self = deepFreeze(must(addRelationship(frozen(), 'note', 'note').erd));
    expect(valid(deleteEntities(self, ['note'])).relationships).toEqual([]);
  });

  it('ignores unknown ids', () => {
    const doc = frozen();
    expect(deleteEntities(doc, ['nope'])).toBe(doc);
  });
});

describe('attributes', () => {
  it('adds an empty attribute at the end by default', () => {
    const { erd, id } = addAttribute(frozen(), 'user');
    valid(erd);
    expect(id).toMatch(/^attr_[0-9a-z]{8}$/);
    expect(entity(erd, 'user').attributes.map((a) => a.id)).toEqual([
      'user-email',
      'user-name',
      id,
    ]);
    expect(entity(erd, 'user').attributes.at(-1)).toEqual({ id, name: '' });
  });

  it('adds directly after a given attribute', () => {
    const { erd, id } = addAttribute(frozen(), 'note', 'note-title');
    expect(entity(valid(erd), 'note').attributes.map((a) => a.id)).toEqual([
      'note-title',
      id,
      'note-body',
      'note-updated',
    ]);
  });

  it('returns no id for an unknown entity', () => {
    const doc = frozen();
    expect(addAttribute(doc, 'nope')).toEqual({ erd: doc, id: null });
  });

  it('updates the name and note, removing a blank note', () => {
    let erd = valid(
      updateAttribute(frozen(), 'note', 'note-body', { name: 'content', note: 'markdown' }),
    );
    expect(must(entity(erd, 'note').attributes[1])).toEqual({
      id: 'note-body',
      name: 'content',
      note: 'markdown',
    });
    erd = valid(updateAttribute(deepFreeze(erd), 'note', 'note-updated', { note: '' }));
    expect(must(entity(erd, 'note').attributes[2])).toEqual({
      id: 'note-updated',
      name: 'updated at',
    });
  });

  it('returns the same document for a no-op update', () => {
    const doc = frozen();
    expect(updateAttribute(doc, 'note', 'note-body', { name: 'body' })).toBe(doc);
    expect(updateAttribute(doc, 'note', 'nope', { name: 'x' })).toBe(doc);
  });

  it('deletes an attribute', () => {
    const erd = valid(deleteAttribute(frozen(), 'user', 'user-email'));
    expect(entity(erd, 'user').attributes.map((a) => a.id)).toEqual(['user-name']);
  });
});

describe('moveEntities', () => {
  it('moves several entities, rounding to whole units', () => {
    const erd = valid(
      moveEntities(frozen(), { user: { x: 10.4, y: 20.5 }, note: { x: -3, y: 0 } }),
    );
    expect(erd.layout).toEqual({ user: { x: 10, y: 21 }, note: { x: -3, y: 0 } });
  });

  it('adds a layout entry for an entity that had none', () => {
    const { erd: added, id } = addEntity(frozen(), { x: 0, y: 0 });
    const layout = Object.fromEntries(Object.entries(added.layout).filter(([key]) => key !== id));
    const unplaced = deepFreeze({ ...added, layout });
    expect(valid(moveEntities(unplaced, { [id]: { x: 5, y: 6 } })).layout[id]).toEqual({
      x: 5,
      y: 6,
    });
  });

  it('ignores unknown ids and unchanged positions', () => {
    const doc = frozen();
    expect(moveEntities(doc, { nope: { x: 1, y: 1 }, user: { x: 0, y: 0 } })).toBe(doc);
  });
});

describe('relationships', () => {
  it('adds one → zero-many by default', () => {
    const { erd, id } = addRelationship(frozen(), 'note', 'user');
    valid(erd);
    expect(rel(erd, must(id))).toEqual({
      id,
      from: 'note',
      to: 'user',
      fromCard: 'one',
      toCard: 'zero-many',
    });
  });

  it('refuses unknown entities', () => {
    const doc = frozen();
    expect(addRelationship(doc, 'user', 'nope')).toEqual({ erd: doc, id: null });
  });

  it('updates cardinalities and label, removing a blank label', () => {
    let erd = valid(
      updateRelationship(frozen(), 'user-notes', { fromCard: 'zero-one', toCard: 'many' }),
    );
    expect(rel(erd, 'user-notes')).toMatchObject({
      fromCard: 'zero-one',
      toCard: 'many',
      label: 'owns',
    });
    erd = valid(updateRelationship(deepFreeze(erd), 'user-notes', { label: ' ' }));
    expect('label' in rel(erd, 'user-notes')).toBe(false);
    erd = valid(updateRelationship(deepFreeze(erd), 'user-notes', { label: 'writes' }));
    expect(rel(erd, 'user-notes').label).toBe('writes');
  });

  it('reverses both ends and both cardinalities', () => {
    const erd = valid(reverseRelationship(frozen(), 'user-notes'));
    expect(rel(erd, 'user-notes')).toEqual({
      id: 'user-notes',
      from: 'note',
      to: 'user',
      fromCard: 'zero-many',
      toCard: 'one',
      label: 'owns',
    });
    expect(reverseRelationship(deepFreeze(erd), 'user-notes')).toEqual(notesErd());
  });

  it('deletes relationships', () => {
    const erd = valid(deleteRelationships(frozen(), ['user-notes']));
    expect(erd.relationships).toEqual([]);
    expect(erd.entities).toHaveLength(2);
    const doc = frozen();
    expect(deleteRelationships(doc, ['nope'])).toBe(doc);
  });
});
