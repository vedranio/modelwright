import type { Rect, Side } from '../canvas/edgeGeometry';
import { MARKER } from './markers';

export interface EdgeEnd {
  x: number;
  y: number;
  side: Side;
}

/**
 * Where a floating edge meets its two cards, on the sides that face each other. Cards further
 * apart horizontally than vertically connect left/right, otherwise top/bottom. The ends sit at
 * the middle of the span the two sides share, so the line runs straight, or at each side's
 * midpoint when they share none. They re-route as the cards move.
 */
export function floatingEnds(
  source: Rect,
  target: Rect,
  /** Shifts both ends along their sides, to keep parallel relationships apart. */
  offset = 0,
): { source: EdgeEnd; target: EdgeEnd } {
  const gapX = Math.max(target.x - (source.x + source.width), source.x - (target.x + target.width));
  const gapY = Math.max(
    target.y - (source.y + source.height),
    source.y - (target.y + target.height),
  );
  const targetIsAfter =
    gapX >= gapY ? centre(target).x >= centre(source).x : centre(target).y >= centre(source).y;

  const [sourceSide, targetSide]: [Side, Side] =
    gapX >= gapY
      ? targetIsAfter
        ? ['right', 'left']
        : ['left', 'right']
      : targetIsAfter
        ? ['bottom', 'top']
        : ['top', 'bottom'];

  const sourceEnd = { ...sideMidpoint(source, sourceSide), side: sourceSide };
  const targetEnd = { ...sideMidpoint(target, targetSide), side: targetSide };

  // When the facing sides overlap, meet in the middle of the shared span so the line runs
  // straight across instead of jogging between two different midpoints.
  const horizontal = gapX >= gapY;
  const shared = horizontal
    ? overlap(source.y, source.y + source.height, target.y, target.y + target.height)
    : overlap(source.x, source.x + source.width, target.x, target.x + target.width);
  if (shared !== null) {
    if (horizontal) sourceEnd.y = targetEnd.y = shared;
    else sourceEnd.x = targetEnd.x = shared;
  }
  if (horizontal) {
    sourceEnd.y += offset;
    targetEnd.y += offset;
  } else {
    sourceEnd.x += offset;
    targetEnd.x += offset;
  }
  return { source: sourceEnd, target: targetEnd };
}

/** Keeps a straight line's ends this far from a card's corners. */
export const CORNER_CLEARANCE = 16;

/** The middle of the overlap of two spans, each inset from its corners, or null if none. */
function overlap(a0: number, a1: number, b0: number, b1: number): number | null {
  const start = Math.max(a0, b0) + CORNER_CLEARANCE;
  const end = Math.min(a1, b1) - CORNER_CLEARANCE;
  return start <= end ? (start + end) / 2 : null;
}

function centre(r: Rect) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function sideMidpoint(r: Rect, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: r.x + r.width / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.width / 2, y: r.y + r.height };
    case 'left':
      return { x: r.x, y: r.y + r.height / 2 };
    case 'right':
      return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
}

/** A relationship's place among those joining the same two entities (or one entity to itself). */
export interface ParallelSlot {
  index: number;
  count: number;
}

/**
 * Groups relationships that join the same pair of entities, in either direction, and gives
 * each its place in document order. Self-relationships group per entity. Lone ones are 0 of 1.
 */
export function parallelSlots(
  relationships: readonly { id: string; from: string; to: string }[],
): Map<string, ParallelSlot> {
  const groups = new Map<string, string[]>();
  for (const r of relationships) {
    const key = [r.from, r.to].sort().join('\u0000');
    groups.set(key, [...(groups.get(key) ?? []), r.id]);
  }
  const slots = new Map<string, ParallelSlot>();
  for (const ids of groups.values()) {
    ids.forEach((id, index) => slots.set(id, { index, count: ids.length }));
  }
  return slots;
}

/**
 * The least space between parallel relationships. Horizontal lines need room for a label
 * above each one (16 units of text and a 4-unit gap) clear of the next line; vertical lines,
 * whose labels sit beside them at staggered heights, need room for their markers (14 across).
 */
export const PARALLEL_MIN_HORIZONTAL = 28;
export const PARALLEL_MIN_VERTICAL = 24;
/** Parallel lines spread out to use the sides they share, but no further apart than this. */
export const PARALLEL_MAX = 40;

export interface ParallelRoute {
  ends: { source: EdgeEnd; target: EdgeEnd };
  /** This line's shift along the sides, centred on zero across the group. */
  offset: number;
  /**
   * Where the middle run of a stepped path sits (x for left/right ends, y for top/bottom), or
   * null when the line runs straight. Parallel stepped paths turn at their own place, nested
   * so they never cross.
   */
  center: number | null;
}

/**
 * One of several relationships between the same two cards: evenly spread along the sides they
 * share, far enough apart that markers and labels stay clear of the neighbouring lines.
 */
export function parallelRoute(source: Rect, target: Rect, slot: ParallelSlot): ParallelRoute {
  const base = floatingEnds(source, target);
  const leftRight = base.source.side === 'left' || base.source.side === 'right';
  const lo = (r: Rect) => (leftRight ? r.y : r.x);
  const len = (r: Rect) => (leftRight ? r.height : r.width);
  // The room to spread over: the span the sides share, or else the shorter side.
  const shared =
    Math.min(lo(source) + len(source), lo(target) + len(target)) - Math.max(lo(source), lo(target));
  const room = Math.max(shared, Math.min(len(source), len(target))) - 2 * CORNER_CLEARANCE;
  const min = leftRight ? PARALLEL_MIN_HORIZONTAL : PARALLEL_MIN_VERTICAL;
  const spacing =
    slot.count > 1 ? Math.min(PARALLEL_MAX, Math.max(min, room / (slot.count - 1))) : 0;
  const offset = (slot.index - (slot.count - 1) / 2) * spacing;

  const ends = floatingEnds(source, target, offset);
  const straight = leftRight ? ends.source.y === ends.target.y : ends.source.x === ends.target.x;
  if (straight) return { ends, offset, center: null };
  // A stepped path: the line that starts on the side the path steps towards turns first.
  const [from, to] = leftRight ? [ends.source.x, ends.target.x] : [ends.source.y, ends.target.y];
  const stepsForward = leftRight ? ends.target.y > ends.source.y : ends.target.x > ends.source.x;
  const center = (from + to) / 2 + (stepsForward ? -offset : offset);
  return { ends, offset, center };
}

/** How far the innermost self-relationship loop stands off the card beyond its markers. */
export const SELF_LOOP_REACH = 48;
/**
 * Nested loops on one card sit this far apart, both along the side and away from it, leaving
 * room for each loop's label (16 units tall) clear of the next loop out.
 */
export const SELF_LOOP_SPACING = 24;

/** Where a label sits relative to its anchor. */
export type LabelPlacement = 'above' | 'below' | 'right';

export interface SelfLoop {
  ends: { source: EdgeEnd; target: EdgeEnd };
  /** Corner points of the loop, from the source end to the target end. */
  points: { x: number; y: number }[];
  /** The label's anchor, on the loop's outermost horizontal run, and which way it sits. */
  label: { x: number; y: number; placement: LabelPlacement };
}

/**
 * A relationship from an entity to itself: a loop off one side of the card. Several loops on
 * one card nest, each wider and further out than the last, so they never overlap.
 */
export function selfLoop(r: Rect, slot: ParallelSlot, side: Side = 'right'): SelfLoop {
  const half = SELF_LOOP_SPACING / 2 + slot.index * SELF_LOOP_SPACING;
  const out = MARKER.extent + SELF_LOOP_REACH + slot.index * SELF_LOOP_SPACING;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  // In a frame where u runs out from the side and v along it.
  const at = (u: number, v: number) => {
    switch (side) {
      case 'right':
        return { x: r.x + r.width + u, y: cy + v };
      case 'left':
        return { x: r.x - u, y: cy + v };
      case 'top':
        return { x: cx + v, y: r.y - u };
      case 'bottom':
        return { x: cx + v, y: r.y + r.height + u };
    }
  };
  const points = [at(0, -half), at(out, -half), at(out, half), at(0, half)];
  const sideways = side === 'left' || side === 'right';
  // Beside a left or right side, the label sits above the loop's top run, past the markers.
  // Above or below the card, it sits outside the loop's far run.
  const anchor = sideways ? at((MARKER.extent + out) / 2, -half) : at(out, 0);
  return {
    ends: {
      source: { ...(points[0] as { x: number; y: number }), side },
      target: { ...(points[3] as { x: number; y: number }), side },
    },
    points,
    label: { ...anchor, placement: side === 'bottom' ? 'below' : 'above' },
  };
}

/**
 * Which side of a card its self-relationships loop off: the one with the most free space
 * before another card in that direction. Ties go right, then bottom, left and top.
 */
export function selfLoopSide(r: Rect, others: readonly Rect[]): Side {
  const clearance = (side: Side) => {
    let best = Infinity;
    for (const o of others) {
      const acrossX = o.x < r.x + r.width && o.x + o.width > r.x;
      const acrossY = o.y < r.y + r.height && o.y + o.height > r.y;
      const gap =
        side === 'right' && acrossY && o.x >= r.x + r.width
          ? o.x - (r.x + r.width)
          : side === 'left' && acrossY && o.x + o.width <= r.x
            ? r.x - (o.x + o.width)
            : side === 'bottom' && acrossX && o.y >= r.y + r.height
              ? o.y - (r.y + r.height)
              : side === 'top' && acrossX && o.y + o.height <= r.y
                ? r.y - (o.y + o.height)
                : Infinity;
      best = Math.min(best, gap);
    }
    return best;
  };
  const order: Side[] = ['right', 'bottom', 'left', 'top'];
  return order.reduce((best, side) => (clearance(side) > clearance(best) ? side : best));
}
