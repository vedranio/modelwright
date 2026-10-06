/** Geometry shared by every edge type: sides, rectangles and orthogonal paths in canvas units. */

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Corner radius of orthogonal edge paths, in canvas units. */
export const CORNER_RADIUS = 8;

/** The rotation, in degrees, that turns a marker frame's +x into the side's outward normal. */
export function sideAngle(side: Side): number {
  return { right: 0, bottom: 90, left: 180, top: -90 }[side];
}

/**
 * An SVG path through axis-aligned waypoints, with each corner rounded by up to `radius`
 * (less where a segment is too short for the full radius). Repeated and collinear points are
 * dropped first, so callers can pass waypoints without tidying them.
 */
export function orthogonalPath(points: readonly Point[], radius = CORNER_RADIUS): string {
  const pts = simplifyPath(points);
  const [first] = pts;
  if (!first) return '';
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Point;
    const next = pts[i + 1];
    if (!next) {
      d += ` L ${p.x} ${p.y}`;
      break;
    }
    const prev = pts[i - 1] as Point;
    const r = Math.min(radius, distance(prev, p) / 2, distance(p, next) / 2);
    const before = towards(p, prev, r);
    const after = towards(p, next, r);
    d += ` L ${before.x} ${before.y} Q ${p.x} ${p.y} ${after.x} ${after.y}`;
  }
  return d;
}

/** The same path without repeated points or points in the middle of a straight run. */
export function simplifyPath(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const beforeLast = out[out.length - 2];
    if (
      last &&
      beforeLast &&
      ((beforeLast.x === last.x && last.x === p.x) || (beforeLast.y === last.y && last.y === p.y))
    ) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** The point `r` from `from` towards `to` along an axis-aligned segment. */
function towards(from: Point, to: Point, r: number): Point {
  return {
    x: from.x + Math.sign(to.x - from.x) * r,
    y: from.y + Math.sign(to.y - from.y) * r,
  };
}
