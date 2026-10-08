import type { Position } from '@modelwright/schema';
import type { Rect } from './edgeGeometry';
import { PLACEMENT_GAP, type Size } from './placement';

/** The least space kept between a new card and any other, in canvas units. */
export const MIN_CLEARANCE = 16;

/** Whether two cards, with `margin` kept around them, overlap. */
export function overlaps(a: Rect, b: Rect, margin = MIN_CLEARANCE): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

/**
 * The nearest spot at or to the right of `at` where a card of `size` overlaps none of `rects`:
 * each time it would hit one, it moves past that card's right edge by `PLACEMENT_GAP`. Pure.
 */
export function nudgeClear(rects: readonly Rect[], at: Position, size: Size): Position {
  const spot = { x: Math.round(at.x), y: Math.round(at.y) };
  // Every move is past a card's right edge, so this ends within one pass per card.
  for (let i = 0; i <= rects.length; i++) {
    const hit = rects.find((r) => overlaps({ ...spot, ...size }, r));
    if (!hit) return spot;
    spot.x = Math.round(hit.x + hit.width + PLACEMENT_GAP);
  }
  return spot;
}

/**
 * Where a new card goes when it's added from the toolbar or a shortcut: to the right of
 * `anchor` (the selected card, or the last one added), top-aligned with it and one
 * `PLACEMENT_GAP` away, moved further right past anything already there. Never on top of a card.
 */
export function besideAnchor(rects: readonly Rect[], anchor: Rect, size: Size): Position {
  return nudgeClear(rects, { x: anchor.x + anchor.width + PLACEMENT_GAP, y: anchor.y }, size);
}
