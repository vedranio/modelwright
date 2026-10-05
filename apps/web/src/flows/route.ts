import { simplifyPath, type Point, type Rect } from '../canvas/edgeGeometry';

/** Straight run out of a CTA and into a target before the path may turn, in canvas units. */
export const STUB = 20;
/** How far a path going round a card keeps from its edges. */
export const CLEARANCE = 24;
/** Space between paths going round the same card, so each loop keeps its own track. */
export const TRACK_SPACING = 8;
/** Space between the first turns of transitions fanning out of one CTA. */
export const FAN_SPACING = 12;

/** A transition's place among those starting from the same CTA. */
export interface Fan {
  index: number;
  count: number;
}

export interface Route {
  points: Point[];
  /** Where the label goes: the middle of the longest horizontal run, so it sits above it. */
  label: Point;
}

/**
 * The waypoints of a transition, from a CTA handle on the source card's right edge to a target
 * handle on the target card's left edge, in orthogonal steps:
 *
 * - **Forward** (room between them): out, one vertical jog in the middle, in.
 * - **Backward or same card:** out past the right of both cards, along a lane, then in from the
 *   left of both. The lane runs through the gap between the cards when they're stacked with room
 *   between them, otherwise above or below both, whichever is shorter. A transition to another
 *   state of its own card loops round that card without crossing its contents.
 *
 * Transitions fanning out of one CTA (`fan.count` > 1) each turn at their own column,
 * `FAN_SPACING` apart from the CTA outwards, so they separate straight away and stay
 * individually clickable. `track` (0, 1, 2…) pushes a path going round the cards further out,
 * so several loops round one card don't run on top of each other.
 */
export function routeTransition(
  source: Point,
  target: Point,
  sourceRect: Rect,
  targetRect: Rect,
  fan: Fan = { index: 0, count: 1 },
  track = 0,
): Route {
  const outX = source.x + STUB;
  const inX = target.x - STUB;
  const fanned = fan.count > 1;
  /** The column a fanned transition turns at. */
  const fanX = outX + fan.index * FAN_SPACING;

  if (inX - outX >= 0) {
    const midX = fanned ? Math.min(fanX, inX) : (outX + inX) / 2;
    const points = simplifyPath([
      source,
      { x: midX, y: source.y },
      { x: midX, y: target.y },
      target,
    ]);
    return { points, label: longestHorizontalMiddle(points) };
  }

  const spread = track * TRACK_SPACING;
  const clear = Math.max(rightOf(sourceRect), rightOf(targetRect)) + STUB;
  // A fanned loop turns at its own column (past both cards), so it parts from its siblings.
  const right = fanned ? Math.max(fanX, clear) : clear + spread;
  const left = Math.min(sourceRect.x, targetRect.x) - STUB - spread;
  const lane = laneY(source, target, sourceRect, targetRect, spread);
  const points = simplifyPath([
    source,
    { x: right, y: source.y },
    { x: right, y: lane },
    { x: left, y: lane },
    { x: left, y: target.y },
    target,
  ]);
  return { points, label: longestHorizontalMiddle(points) };
}

function rightOf(r: Rect): number {
  return r.x + r.width;
}

function bottom(r: Rect): number {
  return r.y + r.height;
}

/** The y of the horizontal lane a backward path runs along. */
function laneY(source: Point, target: Point, a: Rect, b: Rect, spread: number): number {
  // Stacked with room between them: run through the gap.
  if (bottom(a) + 2 * CLEARANCE <= b.y) return (bottom(a) + b.y) / 2;
  if (bottom(b) + 2 * CLEARANCE <= a.y) return (bottom(b) + a.y) / 2;
  // Otherwise round the top or bottom of both, whichever is the shorter way.
  const above = Math.min(a.y, b.y) - CLEARANCE - spread;
  const below = Math.max(bottom(a), bottom(b)) + CLEARANCE + spread;
  const viaAbove = source.y - above + (target.y - above);
  const viaBelow = below - source.y + (below - target.y);
  return viaAbove <= viaBelow ? above : below;
}

function longestHorizontalMiddle(points: readonly Point[]): Point {
  let best: Point = points[0] ?? { x: 0, y: 0 };
  let bestLength = -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    if (a.y !== b.y) continue;
    const length = Math.abs(b.x - a.x);
    if (length > bestLength) {
      bestLength = length;
      best = { x: (a.x + b.x) / 2, y: a.y };
    }
  }
  return best;
}
