import { describe, expect, it } from 'vitest';
import { deletionPrompt } from '../src/erd/deletion';
import { addEntity } from '../src/erd/ops';
import { notesErd } from './fixtures';

const ids = (...xs: string[]) => new Set(xs);

describe('deletionPrompt', () => {
  it('names a single entity with its attributes and relationships', () => {
    expect(deletionPrompt(notesErd(), ids('user'), ids())).toBe(
      "Delete 'User', its 2 attributes and 1 relationship?",
    );
  });

  it('counts several entities together', () => {
    expect(deletionPrompt(notesErd(), ids('user', 'note'), ids())).toBe(
      'Delete 2 entities, their 5 attributes and 1 relationship?',
    );
  });

  it('leaves out parts that are zero', () => {
    const { erd, id } = addEntity(notesErd(), { x: 0, y: 0 });
    const withRel = {
      ...erd,
      relationships: [
        ...erd.relationships,
        { id: 'r2', from: id, to: 'user', fromCard: 'one' as const, toCard: 'many' as const },
      ],
    };
    expect(deletionPrompt(withRel, ids(id), ids())).toBe("Delete 'Entity' and its 1 relationship?");
  });

  it('asks nothing for empty entities or bare relationships', () => {
    const { erd, id } = addEntity(notesErd(), { x: 0, y: 0 });
    expect(deletionPrompt(erd, ids(id), ids())).toBeNull();
    expect(deletionPrompt(erd, ids(), ids('user-notes'))).toBeNull();
  });

  it('includes selected relationships in the count when the delete cascades', () => {
    const { erd, id } = addEntity(notesErd(), { x: 0, y: 0 });
    const doc = {
      ...erd,
      entities: erd.entities.map((e) =>
        e.id === id ? { ...e, attributes: [{ id: 'a', name: 'x' }] } : e,
      ),
    };
    expect(deletionPrompt(doc, ids(id), ids('user-notes'))).toBe(
      "Delete 'Entity', its 1 attribute and 1 relationship?",
    );
  });
});
