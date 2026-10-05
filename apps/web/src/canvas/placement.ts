import type { Layout, Position } from '@modelwright/schema';

/** A card's size in canvas units. */
export interface Size {
  width: number;
  height: number;
}

/** Space between placed nodes, and between them and the positioned ones above. */
export const PLACEMENT_GAP = 64;
/** Nodes per row when there are no positioned nodes to place below. */
export const GRID_COLUMNS = 4;

/**
 * Positions for every node: its `layout` entry when it has one, otherwise a computed spot.
 * Unpositioned nodes go in document order, in a row below the bounding box of the positioned
 * ones, left-aligned with it. With nothing positioned they form a grid from the origin.
 * Positions are each card's top-left corner in canvas units. `sizeOf` estimates a card's size
 * (each view passes its own). Pure: nothing here writes the file.
 */
export function placeNodes<T extends { id: string }>(
  nodes: readonly T[],
  layout: Layout,
  sizeOf: (node: T) => Size,
): Layout {
  const placed: Layout = {};
  const positioned = nodes.filter((n) => layout[n.id] !== undefined);
  const unpositioned = nodes.filter((n) => layout[n.id] === undefined);

  for (const node of positioned) placed[node.id] = layout[node.id] as Position;
  if (unpositioned.length === 0) return placed;

  if (positioned.length === 0) {
    placeGrid(unpositioned, sizeOf, placed);
    return placed;
  }

  let left = Infinity;
  let bottom = -Infinity;
  for (const node of positioned) {
    const { x, y } = placed[node.id] as Position;
    left = Math.min(left, x);
    bottom = Math.max(bottom, y + sizeOf(node).height);
  }

  let x = left;
  const y = bottom + PLACEMENT_GAP;
  for (const node of unpositioned) {
    placed[node.id] = { x, y };
    x += sizeOf(node).width + PLACEMENT_GAP;
  }
  return placed;
}

function placeGrid<T extends { id: string }>(
  nodes: T[],
  sizeOf: (node: T) => Size,
  placed: Layout,
): void {
  let y = 0;
  for (let start = 0; start < nodes.length; start += GRID_COLUMNS) {
    const row = nodes.slice(start, start + GRID_COLUMNS);
    let x = 0;
    let rowHeight = 0;
    for (const node of row) {
      const size = sizeOf(node);
      placed[node.id] = { x, y };
      x += size.width + PLACEMENT_GAP;
      rowHeight = Math.max(rowHeight, size.height);
    }
    y += rowHeight + PLACEMENT_GAP;
  }
}
