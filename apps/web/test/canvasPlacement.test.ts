import { describe, expect, it } from 'vitest';
import type { Layout, Position } from '@modelwright/schema';
import { GRID_COLUMNS, PLACEMENT_GAP, placeNodes, type Size } from '../src/canvas/placement';
import { must } from './helpers';

interface Box {
  id: string;
  width: number;
  height: number;
}

const box = (id: string, width = 200, height = 100): Box => ({ id, width, height });
const sizeOf = (b: Box): Size => ({ width: b.width, height: b.height });

function assertNoOverlap(nodes: Box[], layout: Layout) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = must(nodes[i]);
      const b = must(nodes[j]);
      const pa = must(layout[a.id]) as Position;
      const pb = must(layout[b.id]) as Position;
      const overlap =
        pa.x < pb.x + b.width &&
        pb.x < pa.x + a.width &&
        pa.y < pb.y + b.height &&
        pb.y < pa.y + a.height;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe('placeNodes', () => {
  it('uses the size estimator it is given', () => {
    const nodes = [box('a', 300, 50), box('b', 100, 400), box('c')];
    const layout = placeNodes(nodes, {}, sizeOf);
    expect(layout.b).toEqual({ x: 300 + PLACEMENT_GAP, y: 0 });
    expect(layout.c).toEqual({ x: 300 + PLACEMENT_GAP + 100 + PLACEMENT_GAP, y: 0 });
    assertNoOverlap(nodes, layout);
  });

  it('places unpositioned nodes below the tallest positioned one without overlap', () => {
    const nodes = [box('a', 200, 500), box('b'), box('c', 400, 80), box('d')];
    const layout = placeNodes(nodes, { a: { x: 0, y: 0 }, b: { x: 260, y: 40 } }, sizeOf);
    expect(must(layout.c).y).toBe(500 + PLACEMENT_GAP);
    assertNoOverlap(nodes, layout);
  });

  it('wraps a grid after GRID_COLUMNS nodes without overlap', () => {
    const nodes = Array.from({ length: GRID_COLUMNS * 2 + 1 }, (_, i) =>
      box(`n${i}`, 150 + i * 10, 80 + i * 20),
    );
    const layout = placeNodes(nodes, {}, sizeOf);
    expect(must(layout[`n${GRID_COLUMNS}`]).x).toBe(0);
    assertNoOverlap(nodes, layout);
  });

  it('is deterministic and leaves the layout untouched', () => {
    const nodes = [box('a'), box('b'), box('c')];
    const layout: Layout = { b: { x: 5, y: 5 } };
    const before = structuredClone(layout);
    expect(placeNodes(nodes, layout, sizeOf)).toEqual(placeNodes(nodes, layout, sizeOf));
    expect(layout).toEqual(before);
  });
});
