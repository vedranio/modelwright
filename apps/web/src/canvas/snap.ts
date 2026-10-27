import type { Rect } from './edgeGeometry';

/** How close, in screen pixels, a card's edge or centre has to come to another's to snap. */
export const SNAP_DISTANCE_PX = 6;

/** A faint line showing an alignment: vertical at `x = at` or horizontal at `y = at`. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export interface Snapped {
  /** How far to move the dragged cards so they line up. */
  dx: number;
  dy: number;
  guides: Guide[];
}

/** The union of some rectangles, or null for none. */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Left, centre and right (or top, middle and bottom) of a rectangle. */
function lines(r: Rect, axis: 'x' | 'y'): number[] {
  const start = axis === 'x' ? r.x : r.y;
  const size = axis === 'x' ? r.width : r.height;
  return [start, start + size / 2, start + size];
}

/** The smallest move, within `threshold`, that puts one of `moving`'s lines on another's. */
function nearest(moving: Rect, others: readonly Rect[], axis: 'x' | 'y', threshold: number) {
  let best: number | null = null;
  for (const other of others) {
    for (const target of lines(other, axis)) {
      for (const line of lines(moving, axis)) {
        const d = target - line;
        if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    }
  }
  return best ?? 0;
}

/**
 * Lines the dragged cards' bounding box (`moving`) up with the other cards, Figma-style: its
 * left, centre or right with theirs, and its top, middle or bottom with theirs, when within
 * `threshold` canvas units. Returns the move that does it and a guide for every line that
 * then coincides, spanning the cards it joins.
 */
export function snap(moving: Rect, others: readonly Rect[], threshold: number): Snapped {
  const dx = nearest(moving, others, 'x', threshold);
  const dy = nearest(moving, others, 'y', threshold);
  const placed = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    if ((axis === 'x' ? dx : dy) === 0 && !others.some((o) => sharesLine(placed, o, axis))) {
      continue;
    }
    const cross = axis === 'x' ? 'y' : 'x';
    for (const at of lines(placed, axis)) {
      const joined = others.filter((o) => lines(o, axis).some((l) => Math.abs(l - at) < 0.5));
      if (joined.length === 0) continue;
      const spans = [placed, ...joined].flatMap((r) => {
        const [start, , end] = lines(r, cross);
        return [start as number, end as number];
      });
      guides.push({ axis, at, from: Math.min(...spans), to: Math.max(...spans) });
    }
  }
  return { dx, dy, guides };
}

function sharesLine(a: Rect, b: Rect, axis: 'x' | 'y'): boolean {
  return lines(a, axis).some((l) => lines(b, axis).some((m) => Math.abs(l - m) < 0.5));
}
