import { describe, expect, it } from 'vitest';
import { Erd } from '@modelwright/schema';
import { pruneAnchors } from '../src/canvas/anchors';
import {
  anchorPoint,
  clearRelationshipAnchors,
  dropAnchor,
  nearestAnchor,
  setRelationshipAnchor,
} from '../src/erd/anchors';
import { deleteRelationships, duplicateEntities, reverseRelationship } from '../src/erd/ops';
import { notesErd } from './fixtures';
import { deepFreeze, must } from './helpers';

const card = { x: 100, y: 50, width: 200, height: 100 };
const valid = (erd: Erd) => {
  const result = Erd.safeParse(erd);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return erd;
};
const rel = (erd: Erd) => must(erd.relationships[0]).id;

describe('anchor geometry', () => {
  it('puts an anchor on its side, `at` of the way along', () => {
    expect(anchorPoint(card, { side: 'top', at: 0.25 })).toEqual({ x: 150, y: 50, side: 'top' });
    expect(anchorPoint(card, { side: 'right', at: 1 })).toEqual({ x: 300, y: 150, side: 'right' });
    expect(anchorPoint(card, { side: 'bottom', at: 0 })).toEqual({
      x: 100,
      y: 150,
      side: 'bottom',
    });
    expect(anchorPoint(card, { side: 'left', at: 0.5 })).toEqual({ x: 100, y: 100, side: 'left' });
  });

  it('finds the nearest side and where along it, clamped and rounded', () => {
    expect(nearestAnchor(card, { x: 170, y: 40 })).toEqual({ side: 'top', at: 0.35 });
    expect(nearestAnchor(card, { x: 320, y: 60 })).toEqual({ side: 'right', at: 0.1 });
    expect(nearestAnchor(card, { x: 50, y: 400 })).toEqual({ side: 'bottom', at: 0 });
    expect(nearestAnchor(card, { x: 101, y: 133.333 })).toEqual({ side: 'left', at: 0.83 });
  });

  it('anchors a drop only near the outline', () => {
    expect(dropAnchor(card, { x: 110, y: 100 })).toEqual({ side: 'left', at: 0.5 });
    expect(dropAnchor(card, { x: 200, y: 100 })).toBeNull();
    expect(dropAnchor(card, { x: 20, y: 100 })).toBeNull();
  });
});

describe('relationship anchors', () => {
  it('sets one end, then the other, and clears them, dropping the empty block', () => {
    const doc = deepFreeze(notesErd());
    const id = rel(doc);
    const one = valid(setRelationshipAnchor(doc, id, 'from', { side: 'bottom', at: 0.5 }));
    expect(one.anchors).toEqual({ [id]: { from: { side: 'bottom', at: 0.5 } } });
    expect(setRelationshipAnchor(deepFreeze(one), id, 'from', { side: 'bottom', at: 0.5 })).toBe(
      one,
    );
    const both = valid(setRelationshipAnchor(deepFreeze(one), id, 'to', { side: 'top', at: 0.2 }));
    expect(both.anchors?.[id]).toEqual({
      from: { side: 'bottom', at: 0.5 },
      to: { side: 'top', at: 0.2 },
    });
    const cleared = clearRelationshipAnchors(deepFreeze(both), id);
    expect(cleared).not.toHaveProperty('anchors');
    expect(setRelationshipAnchor(doc, 'nope', 'from', { side: 'top', at: 0 })).toBe(doc);
  });

  it('swaps its ends’ anchors when the relationship is reversed', () => {
    const doc = notesErd();
    const id = rel(doc);
    const anchored = setRelationshipAnchor(doc, id, 'from', { side: 'left', at: 0.3 });
    expect(valid(reverseRelationship(anchored, id)).anchors?.[id]).toEqual({
      to: { side: 'left', at: 0.3 },
    });
  });

  it('copies anchors with duplicated relationships', () => {
    const doc = notesErd();
    const id = rel(doc);
    const anchored = setRelationshipAnchor(doc, id, 'to', { side: 'top', at: 0.1 });
    const { erd } = duplicateEntities(
      anchored,
      doc.entities.map((e) => e.id),
    );
    valid(erd);
    const copy = must(erd.relationships.at(-1)).id;
    expect(erd.anchors?.[copy]).toEqual({ to: { side: 'top', at: 0.1 } });
  });

  it('pruneAnchors drops entries for relationships that are gone', () => {
    const doc = notesErd();
    const id = rel(doc);
    const anchored = setRelationshipAnchor(doc, id, 'to', { side: 'top', at: 0.1 });
    const gone = deleteRelationships(anchored, [id]);
    const pruned = valid(pruneAnchors(gone, gone.relationships));
    expect(pruned).not.toHaveProperty('anchors');
    expect(pruneAnchors(anchored, anchored.relationships)).toBe(anchored);
  });
});
