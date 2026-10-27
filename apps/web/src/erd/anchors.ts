import type { Anchor, Erd } from '@modelwright/schema';
import type { Point, Rect, Side } from '../canvas/edgeGeometry';
import { withAnchorEnd } from '../canvas/anchors';
import type { EdgeEnd } from './edgeGeometry';

/** The point on a card's outline an anchor names. */
export function anchorPoint(r: Rect, { side, at }: Anchor): EdgeEnd {
  switch (side) {
    case 'top':
      return { x: r.x + at * r.width, y: r.y, side };
    case 'bottom':
      return { x: r.x + at * r.width, y: r.y + r.height, side };
    case 'left':
      return { x: r.x, y: r.y + at * r.height, side };
    case 'right':
      return { x: r.x + r.width, y: r.y + at * r.height, side };
  }
}

/** Positions along a side are kept to two decimals, so files stay readable. */
const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** The anchor nearest a point: the closest point on the card's outline, by side. */
export function nearestAnchor(r: Rect, p: Point): Anchor {
  const sides: Side[] = ['top', 'right', 'bottom', 'left'];
  let best: { side: Side; at: number; d: number } | null = null;
  for (const side of sides) {
    const horizontal = side === 'top' || side === 'bottom';
    const at = clamp(horizontal ? (p.x - r.x) / r.width : (p.y - r.y) / r.height);
    const q = anchorPoint(r, { side, at });
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.d) best = { side, at, d };
  }
  const { side, at } = best as { side: Side; at: number };
  return { side, at: round(at) };
}

/** How far from its outline, in canvas units, a drop still counts as on a side. */
export const ANCHOR_DROP_REACH = 24;

/** The anchor for a drop at `p`, when it's within reach of the card's outline; else null. */
export function dropAnchor(r: Rect, p: Point): Anchor | null {
  const inside = p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  if (!inside) return null;
  const edge = Math.min(p.x - r.x, r.x + r.width - p.x, p.y - r.y, r.y + r.height - p.y);
  return edge <= ANCHOR_DROP_REACH ? nearestAnchor(r, p) : null;
}

/** Fixes one end of a relationship at an anchor, or (null) lets it float again. */
export function setRelationshipAnchor(
  erd: Erd,
  relationshipId: string,
  end: 'from' | 'to',
  anchor: Anchor | null,
): Erd {
  if (!erd.relationships.some((r) => r.id === relationshipId)) return erd;
  return withAnchorEnd(
    erd,
    relationshipId,
    end,
    anchor,
    (a, b) => a.side === b.side && a.at === b.at,
  );
}

/** Lets both ends of a relationship float again. */
export function clearRelationshipAnchors(erd: Erd, relationshipId: string): Erd {
  return setRelationshipAnchor(
    setRelationshipAnchor(erd, relationshipId, 'from', null),
    relationshipId,
    'to',
    null,
  );
}
