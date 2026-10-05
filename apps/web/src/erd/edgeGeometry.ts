import { fanOffsets, type Rect, type Side } from '../canvas/edgeGeometry';

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

/** Space between relationships that join the same two entities. */
export const PARALLEL_SPACING = 16;

/**
 * Offsets for relationships between the same pair of entities (in either direction), centred
 * on zero, so each stays visible and clickable. Keyed by relationship id; lone ones get 0.
 */
export function parallelOffsets(
  relationships: readonly { id: string; from: string; to: string }[],
): Map<string, number> {
  return fanOffsets(
    relationships,
    (r) => (r.from === r.to ? null : [r.from, r.to].sort().join('\u0000')),
    PARALLEL_SPACING,
  );
}
