import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../src/canvas/edgeGeometry';
import {
  CLEARANCE,
  FAN_SPACING,
  STUB,
  TRACK_SPACING,
  cutsThrough,
  routeTransition,
  routeTransitionSides,
} from '../src/flows/route';

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

  it('turns transitions fanning out of one CTA at separate columns, loops included', () => {
    const a = card(0, 0, 300);
    const b = card(400, 0);
    const fan = (index: number) => ({ index, count: 2 });
    const forward = routeTransition({ x: 260, y: 50 }, { x: 400, y: 20 }, a, b, fan(0));
    const loop = routeTransition({ x: 260, y: 50 }, { x: 0, y: 200 }, a, a, fan(1), 3);
    expect(forward.points[1]?.x).toBe(260 + STUB);
    expect(loop.points[1]?.x).toBe(260 + STUB + FAN_SPACING);
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
    const first = routeTransition({ x: 260, y: 40 }, { x: 0, y: 20 }, a, a, undefined, 0);
    const second = routeTransition({ x: 260, y: 40 }, { x: 0, y: 20 }, a, a, undefined, 1);
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

describe('routeTransitionSides', () => {
  const sides = (r: { from: string; to: string }) => `${r.from}→${r.to}`;

  it('keeps right → left when the target is ahead, exactly as routeTransition draws it', () => {
    const a = card(0, 0);
    const b = card(400, 100);
    const route = routeTransitionSides(50, 120, a, b);
    expect(sides(route)).toBe('right→left');
    expect(route.points).toEqual(
      routeTransition({ x: 260, y: 50 }, { x: 400, y: 120 }, a, b).points,
    );
  });

  it('goes left → right when the target is behind the source', () => {
    const a = card(600, 0);
    const b = card(0, 40);
    const route = routeTransitionSides(50, 120, a, b);
    expect(sides(route)).toBe('left→right');
    expect(route.points[0]).toEqual({ x: 600, y: 50 });
    expect(route.points.at(-1)).toEqual({ x: 260, y: 120 });
  });

  it('loops to another state of the same card along its nearer side, not round the whole card', () => {
    const a = card(0, 0, 500);
    const route = routeTransitionSides(400, 100, a, a);
    expect(['right→right', 'left→left']).toContain(sides(route));
    expect(route.points).toHaveLength(4);
    expect(cutsThrough(route.points, a)).toBe(false);
  });

  it('uses a C on one side for stacked cards', () => {
    const a = card(0, 0);
    const b = card(20, 400);
    const route = routeTransitionSides(150, 420, a, b);
    expect(['right→right', 'left→left']).toContain(sides(route));
    expect(cutsThrough(route.points, a)).toBe(false);
    expect(cutsThrough(route.points, b)).toBe(false);
  });

  it('never cuts through either card', () => {
    const a = card(0, 0, 300);
    for (const b of [card(400, 0), card(-500, 50), card(100, 400), card(0, -350), card(300, 250)]) {
      for (const [sy, ty] of [
        [40, b.y + 20],
        [250, b.y + 150],
      ] as const) {
        const route = routeTransitionSides(sy, ty, a, b);
        expect(cutsThrough(route.points, a), JSON.stringify({ b, sy, ty, route })).toBe(false);
        expect(cutsThrough(route.points, b), JSON.stringify({ b, sy, ty, route })).toBe(false);
      }
    }
  });

  it('turns fanned same-side routes at separate columns', () => {
    const a = card(0, 0);
    const b = card(20, 400);
    const one = routeTransitionSides(150, 420, a, b, { index: 0, count: 2 });
    const two = routeTransitionSides(150, 420, a, b, { index: 1, count: 2 });
    expect(Math.abs((one.points[1]?.x ?? 0) - (two.points[1]?.x ?? 0))).toBe(FAN_SPACING);
  });
});
