import type { Entity, Erd, Layout, Position } from '@modelwright/schema';
import type { Size } from './metrics';

/** Space between placed entities, and between them and the positioned ones above. */
export const PLACEMENT_GAP = 64;
/** Entities per row when there are no positioned entities to place below. */
export const GRID_COLUMNS = 4;

/**
 * Positions for every entity: its `layout` entry when it has one, otherwise a computed spot.
 * Unpositioned entities go in document order, in a row below the bounding box of the positioned
 * ones, left-aligned with it. With nothing positioned they form a grid from the origin.
 * Positions are each card's top-left corner in canvas units. Pure: nothing here writes the file.
 */
export function placeEntities(erd: Erd, sizeOf: (entity: Entity) => Size): Layout {
  const placed: Layout = {};
  const positioned = erd.entities.filter((e) => erd.layout[e.id] !== undefined);
  const unpositioned = erd.entities.filter((e) => erd.layout[e.id] === undefined);

  for (const entity of positioned) placed[entity.id] = erd.layout[entity.id] as Position;
  if (unpositioned.length === 0) return placed;

  if (positioned.length === 0) {
    placeGrid(unpositioned, sizeOf, placed);
    return placed;
  }

  let left = Infinity;
  let bottom = -Infinity;
  for (const entity of positioned) {
    const { x, y } = placed[entity.id] as Position;
    left = Math.min(left, x);
    bottom = Math.max(bottom, y + sizeOf(entity).height);
  }

  let x = left;
  const y = bottom + PLACEMENT_GAP;
  for (const entity of unpositioned) {
    placed[entity.id] = { x, y };
    x += sizeOf(entity).width + PLACEMENT_GAP;
  }
  return placed;
}

function placeGrid(entities: Entity[], sizeOf: (entity: Entity) => Size, placed: Layout): void {
  let y = 0;
  for (let start = 0; start < entities.length; start += GRID_COLUMNS) {
    const row = entities.slice(start, start + GRID_COLUMNS);
    let x = 0;
    let rowHeight = 0;
    for (const entity of row) {
      const size = sizeOf(entity);
      placed[entity.id] = { x, y };
      x += size.width + PLACEMENT_GAP;
      rowHeight = Math.max(rowHeight, size.height);
    }
    y += rowHeight + PLACEMENT_GAP;
  }
}
