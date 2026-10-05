import { describe, expect, it } from 'vitest';
import type { Entity, Erd, Position } from '@modelwright/schema';
import { GRID_COLUMNS, PLACEMENT_GAP, type Size } from '../src/canvas/placement';
import { estimateEntitySize } from '../src/erd/metrics';
import { placeEntities } from '../src/erd/placement';
import { must } from './helpers';

function entity(id: string, attributes = 0): Entity {
  return {
    id,
    name: id,
    attributes: Array.from({ length: attributes }, (_, i) => ({ id: `${id}-${i}`, name: `a${i}` })),
  };
}

function erd(entities: Entity[], layout: Erd['layout'] = {}): Erd {
  return { schemaVersion: 1, entities, relationships: [], layout };
}

function overlaps(a: Position, sa: Size, b: Position, sb: Size): boolean {
  return (
    a.x < b.x + sb.width && b.x < a.x + sa.width && a.y < b.y + sb.height && b.y < a.y + sa.height
  );
}

function assertNoOverlap(doc: Erd, layout: Erd['layout']) {
  const items = doc.entities.map((e) => ({
    id: e.id,
    pos: must(layout[e.id]),
    size: estimateEntitySize(e),
  }));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = must(items[i]);
      const b = must(items[j]);
      expect(overlaps(a.pos, a.size, b.pos, b.size), `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe('placeEntities', () => {
  it('returns an empty layout for an empty document', () => {
    expect(placeEntities(erd([]), estimateEntitySize)).toEqual({});
  });

  it('keeps every existing position untouched', () => {
    const doc = erd([entity('a'), entity('b')], { a: { x: 10, y: -5 }, b: { x: 400, y: 30 } });
    expect(placeEntities(doc, estimateEntitySize)).toEqual(doc.layout);
  });

  it('places unpositioned entities in a row below the positioned ones, in document order', () => {
    const doc = erd([entity('c', 1), entity('a', 3), entity('d', 0), entity('b')], {
      a: { x: 100, y: 0 },
      b: { x: -50, y: 200 },
    });
    const layout = placeEntities(doc, estimateEntitySize);
    const bottom = Math.max(
      0 + estimateEntitySize(must(doc.entities[1])).height,
      200 + estimateEntitySize(must(doc.entities[3])).height,
    );

    expect(layout.c).toEqual({ x: -50, y: bottom + PLACEMENT_GAP });
    expect(layout.d).toEqual({
      x: -50 + estimateEntitySize(must(doc.entities[0])).width + PLACEMENT_GAP,
      y: bottom + PLACEMENT_GAP,
    });
    expect(must(layout.d).x).toBeGreaterThan(must(layout.c).x);
    assertNoOverlap(doc, layout);
  });

  it('starts a grid at the origin when nothing is positioned', () => {
    const entities = Array.from({ length: GRID_COLUMNS + 2 }, (_, i) => entity(`e${i}`, i));
    const doc = erd(entities);
    const layout = placeEntities(doc, estimateEntitySize);

    expect(layout.e0).toEqual({ x: 0, y: 0 });
    // The first row runs left to right in document order.
    const firstRow = entities.slice(0, GRID_COLUMNS).map((e) => must(layout[e.id]));
    expect(firstRow.every((p) => p.y === 0)).toBe(true);
    expect(firstRow.map((p) => p.x)).toEqual([...firstRow.map((p) => p.x)].sort((a, b) => a - b));
    // The next row starts below the tallest card in the first.
    const tallest = Math.max(
      ...entities.slice(0, GRID_COLUMNS).map((e) => estimateEntitySize(e).height),
    );
    expect(layout[`e${GRID_COLUMNS}`]).toEqual({ x: 0, y: tallest + PLACEMENT_GAP });
    assertNoOverlap(doc, layout);
  });

  it('is deterministic', () => {
    const doc = erd([entity('a', 2), entity('b'), entity('c', 5)], { b: { x: 7, y: 9 } });
    expect(placeEntities(doc, estimateEntitySize)).toEqual(placeEntities(doc, estimateEntitySize));
  });

  it('does not modify the document', () => {
    const doc = erd([entity('a'), entity('b')], { a: { x: 0, y: 0 } });
    const before = structuredClone(doc);
    placeEntities(doc, estimateEntitySize);
    expect(doc).toEqual(before);
  });
});
