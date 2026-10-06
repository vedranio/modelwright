import { describe, expect, it } from 'vitest';
import { touchedErd, touchedFlows } from '../src/editing/touched';
import { deleteEntities, moveEntities, renameEntity, updateAttribute } from '../src/erd/ops';
import { deleteScreens, renameCta } from '../src/flows/ops';
import { notesErd, notesFlows } from './fixtures';

const sorted = (s: Set<string>) => [...s].sort();

describe('touched by an undo step', () => {
  it('selects an entity whose attribute changed, and nothing else', () => {
    const before = notesErd();
    const after = updateAttribute(before, 'note', 'note-title', { name: 'heading' });
    expect(touchedErd(before, after)).toEqual({ nodes: new Set(['note']), edges: new Set() });
  });

  it('counts a move as a change', () => {
    const before = notesErd();
    const after = moveEntities(before, { user: { x: 500, y: 500 } });
    expect(sorted(touchedErd(before, after).nodes)).toEqual(['user']);
  });

  it('selects everything an undone delete restores', () => {
    const before = deleteEntities(notesErd(), ['user']);
    const after = notesErd();
    expect(touchedErd(before, after)).toEqual({
      nodes: new Set(['user']),
      edges: new Set(['user-notes']),
    });
  });

  it('leaves out what no longer exists', () => {
    const before = notesErd();
    const after = deleteEntities(renameEntity(before, 'note', 'Memo'), ['user']);
    expect(touchedErd(before, after)).toEqual({ nodes: new Set(['note']), edges: new Set() });
  });

  it('works the same on flows', () => {
    const before = notesFlows();
    expect(
      touchedFlows(before, renameCta(before, 'editor', 'editor-default', 'editor-save', 'Keep')),
    ).toEqual({ nodes: new Set(['editor']), edges: new Set() });
    const restored = touchedFlows(deleteScreens(before, ['login']), before);
    expect(sorted(restored.nodes)).toEqual(['login']);
    expect(sorted(restored.edges)).toEqual(['t1']);
  });
});
