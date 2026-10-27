import type { FlowSide, Flows } from '@modelwright/schema';
import { withAnchorEnd } from '../canvas/anchors';
import type { Point, Rect } from '../canvas/edgeGeometry';

/** Fixes the side one end of a transition is drawn on, or (null) lets it be routed again. */
export function setTransitionSide(
  flows: Flows,
  transitionId: string,
  end: 'from' | 'to',
  side: FlowSide | null,
): Flows {
  if (!flows.transitions.some((t) => t.id === transitionId)) return flows;
  return withAnchorEnd(flows, transitionId, end, side, (a, b) => a === b);
}

/** Lets both ends of a transition be routed again. */
export function clearTransitionSides(flows: Flows, transitionId: string): Flows {
  return setTransitionSide(
    setTransitionSide(flows, transitionId, 'from', null),
    transitionId,
    'to',
    null,
  );
}

/** The side of a card a point is nearer to. */
export function nearerSide(r: Rect, p: Point): FlowSide {
  return p.x < r.x + r.width / 2 ? 'left' : 'right';
}

/** How far in from a card's left or right edge, in canvas units, a drop still picks that side. */
export const SIDE_DROP_REACH = 24;

/** The side a drop at `p` picks: left or right when it's that close to the edge, else null. */
export function dropSide(r: Rect, p: Point): FlowSide | null {
  if (p.x >= r.x && p.x <= r.x + SIDE_DROP_REACH) return 'left';
  if (p.x <= r.x + r.width && p.x >= r.x + r.width - SIDE_DROP_REACH) return 'right';
  return null;
}

/** Which side a CTA handle sits on, from its id (`cta-left:…` or `cta:…`). */
export function handleSide(handleId: string): FlowSide {
  return handleId.startsWith('cta-left:') ? 'left' : 'right';
}
