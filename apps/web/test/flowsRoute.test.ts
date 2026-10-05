import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../src/canvas/edgeGeometry';
import { CLEARANCE, STUB, TRACK_SPACING, routeTransition } from '../src/flows/route';

const card = (x: number, y: number, height = 200): Rect => ({ x, y, width: 260, height });
const right = (r: Rect) => r.x + r.width;

/** Whether an axis-aligned segment passes through the inside of a rect. */
function crosses(a: Point, b: Point, r: Rect): boolean {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return (
    x0 < right(r) &&
    x1 > r.x &&
    y0 < r.y + r.height &&
    y1 > r.y &&
    !(x0 === x1 && (x0 === r.x || x0 === right(r)))
  );
}

function segments(points: Point[]): [Point, Point][] {
  return points.slice(1).map((p, i) => [points[i] as Point, p]);
}

describe('routeTransition', () => {
  it('goes straight out, jogs once in the middle and straight in when the target is ahead', () => {
    const a = card(0, 0);
    const b = card(400, 100);
    const route = routeTransition({ x: 260, y: 50 }, { x: 400, y: 120 }, a, b);
    expect(route.points).toEqual([
      { x: 260, y: 50 },
      { x: 330, y: 50 },
      { x: 330, y: 120 },
      { x: 400, y: 120 },
    ]);
  });

  it('fans transitions from one CTA apart by their offset', () => {
    const a = card(0, 0);
    const b = card(400, 0);
    const one = routeTransition({ x: 260, y: 50 }, { x: 400, y: 20 }, a, b, -6);
    const two = routeTransition({ x: 260, y: 50 }, { x: 400, y: 20 }, a, b, 6);
    expect(two.points[1]?.x).toBe((one.points[1]?.x ?? 0) + 12);
  });

  it('loops a same-card transition round the card without crossing it', () => {
    const a = card(0, 0, 300);
    const route = routeTransition({ x: 260, y: 80 }, { x: 0, y: 220 }, a, a);
    const pts = route.points;
    expect(pts[1]).toEqual({ x: 260 + STUB, y: 80 });
    expect(pts.at(-2)).toEqual({ x: -STUB, y: 220 });
    for (const [p, q] of segments(pts).slice(1, -1)) expect(crosses(p, q, a)).toBe(false);
  });

  it('goes round the shorter side of the card', () => {
    const a = card(0, 0, 300);
    const nearTop = routeTransition({ x: 260, y: 40 }, { x: 0, y: 20 }, a, a);
    expect(nearTop.points[2]?.y).toBe(-CLEARANCE);
    const nearBottom = routeTransition({ x: 260, y: 280 }, { x: 0, y: 250 }, a, a);
    expect(nearBottom.points[2]?.y).toBe(300 + CLEARANCE);
  });

  it('runs a backward path through the gap between stacked cards', () => {
    const top = card(0, 0, 200);
    const bottom = card(0, 400, 100);
    const route = routeTransition({ x: 260, y: 450 }, { x: 0, y: 20 }, bottom, top);
    expect(route.points[2]?.y).toBe(300);
    for (const [p, q] of segments(route.points).slice(1, -1)) {
      expect(crosses(p, q, top)).toBe(false);
      expect(crosses(p, q, bottom)).toBe(false);
    }
  });

  it('pushes later tracks further out', () => {
    const a = card(0, 0, 300);
    const first = routeTransition({ x: 260, y: 40 }, { x: 0, y: 20 }, a, a, 0, 0);
    const second = routeTransition({ x: 260, y: 40 }, { x: 0, y: 20 }, a, a, 0, 1);
    expect(second.points[1]?.x).toBe((first.points[1]?.x ?? 0) + TRACK_SPACING);
    expect(second.points[2]?.y).toBe((first.points[2]?.y ?? 0) - TRACK_SPACING);
  });

  it('puts the label at the middle of the longest horizontal run', () => {
    const a = card(0, 0);
    const b = card(600, 0);
    const route = routeTransition({ x: 260, y: 50 }, { x: 600, y: 50 }, a, b);
    expect(route.label).toEqual({ x: 430, y: 50 });
  });
});
