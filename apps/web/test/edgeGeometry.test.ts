import { describe, expect, it } from 'vitest';
import { sideAngle } from '../src/canvas/edgeGeometry';
import type { Rect } from '../src/canvas/edgeGeometry';
import {
  CORNER_CLEARANCE,
  PARALLEL_MAX,
  PARALLEL_MIN_HORIZONTAL,
  PARALLEL_MIN_VERTICAL,
  SELF_LOOP_SPACING,
  floatingEnds,
  parallelRoute,
  parallelSlots,
  selfLoop,
  selfLoopSide,
} from '../src/erd/edgeGeometry';
import { MARKER } from '../src/erd/markers';

const card = (x: number, y: number) => ({ x, y, width: 240, height: 120 });

describe('floatingEnds', () => {
  it('connects facing left/right sides when the cards sit side by side', () => {
    const ends = floatingEnds(card(0, 0), card(320, 0));
    expect(ends.source).toEqual({ x: 240, y: 60, side: 'right' });
    expect(ends.target).toEqual({ x: 320, y: 60, side: 'left' });
  });

  it('runs straight across the span two facing sides share', () => {
    // Heights 120 and 200, tops 0 and 60: the sides share y 60..120.
    const ends = floatingEnds(card(0, 0), { x: 320, y: 60, width: 240, height: 200 });
    expect(ends.source.y).toBe(ends.target.y);
    expect(ends.source.y).toBe((60 + CORNER_CLEARANCE + 120 - CORNER_CLEARANCE) / 2);
  });

  it('falls back to each side’s midpoint when the sides barely overlap', () => {
    const ends = floatingEnds(card(0, 0), card(320, 110));
    expect(ends.source).toEqual({ x: 240, y: 60, side: 'right' });
    expect(ends.target).toEqual({ x: 320, y: 170, side: 'left' });
  });

  it('flips when the target is to the left', () => {
    const ends = floatingEnds(card(320, 0), card(0, 40));
    expect(ends.source.side).toBe('left');
    expect(ends.target.side).toBe('right');
  });

  it('connects top/bottom when the cards are stacked', () => {
    const below = floatingEnds(card(0, 0), card(40, 300));
    expect([below.source.side, below.target.side]).toEqual(['bottom', 'top']);
    expect(below.source).toEqual({ x: 140, y: 120, side: 'bottom' });
    expect(below.target).toEqual({ x: 140, y: 300, side: 'top' });
    const above = floatingEnds(card(0, 300), card(40, 0));
    expect([above.source.side, above.target.side]).toEqual(['top', 'bottom']);
  });

  it('prefers the axis with the larger gap', () => {
    // 100 apart horizontally, 300 apart vertically: stack wins.
    const ends = floatingEnds(card(0, 0), card(340, 420));
    expect(ends.source.side).toBe('bottom');
  });
});

describe('sideAngle', () => {
  it('points the marker frame outward from each side', () => {
    expect(sideAngle('right')).toBe(0);
    expect(sideAngle('bottom')).toBe(90);
    expect(sideAngle('left')).toBe(180);
    expect(sideAngle('top')).toBe(-90);
  });
});

describe('parallel relationships', () => {
  it('shifts both ends along their sides by the offset', () => {
    const plain = floatingEnds(card(0, 0), card(320, 0));
    const shifted = floatingEnds(card(0, 0), card(320, 0), 16);
    expect(shifted.source).toEqual({ ...plain.source, y: plain.source.y + 16 });
    expect(shifted.target).toEqual({ ...plain.target, y: plain.target.y + 16 });
  });

  it('groups relationships between the same pair, in either direction, in document order', () => {
    const slots = parallelSlots([
      { id: 'a', from: 'user', to: 'note' },
      { id: 'b', from: 'note', to: 'user' },
      { id: 'c', from: 'user', to: 'tag' },
      { id: 'self1', from: 'note', to: 'note' },
      { id: 'self2', from: 'note', to: 'note' },
    ]);
    expect(slots.get('a')).toEqual({ index: 0, count: 2 });
    expect(slots.get('b')).toEqual({ index: 1, count: 2 });
    expect(slots.get('c')).toEqual({ index: 0, count: 1 });
    expect(slots.get('self2')).toEqual({ index: 1, count: 2 });
  });

  /** The routes for `count` relationships between two cards. */
  const routes = (source: Rect, target: Rect, count: number) =>
    Array.from({ length: count }, (_, index) => parallelRoute(source, target, { index, count }));

  for (const count of [2, 3, 4]) {
    it(`spreads ${count} side-by-side relationships evenly, as distinct straight lines`, () => {
      const rs = routes(card(0, 0), card(320, 0), count);
      const ys = rs.map((r) => r.ends.source.y);
      // Straight, distinct and in order.
      rs.forEach((r) => expect(r.ends.target.y).toBe(r.ends.source.y));
      expect(new Set(ys).size).toBe(count);
      const gaps = ys.slice(1).map((y, i) => y - (ys[i] as number));
      for (const gap of gaps) {
        expect(gap).toBeCloseTo(gaps[0] as number);
        // Room for a label above each line, and markers well clear of each other.
        expect(gap).toBeGreaterThanOrEqual(PARALLEL_MIN_HORIZONTAL);
        expect(gap).toBeGreaterThan(2 * MARKER.halfSpread);
      }
      // Centred on the shared span, and inside it.
      expect((ys[0] as number) + (ys[count - 1] as number)).toBeCloseTo(120);
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(120);
      }
    });

    it(`spreads ${count} stacked relationships evenly, with markers clear`, () => {
      const rs = routes(card(0, 0), card(0, 300), count);
      const xs = rs.map((r) => r.ends.source.x);
      expect(new Set(xs).size).toBe(count);
      const gaps = xs.slice(1).map((x, i) => x - (xs[i] as number));
      for (const gap of gaps) {
        expect(gap).toBeCloseTo(gaps[0] as number);
        expect(gap).toBeGreaterThanOrEqual(PARALLEL_MIN_VERTICAL);
      }
    });
  }

  it('uses more of a long shared span, up to a limit', () => {
    const tall = { x: 320, y: 0, width: 240, height: 400 };
    const [a, b] = routes({ ...tall, x: 0 }, tall, 2);
    expect((b?.ends.source.y ?? 0) - (a?.ends.source.y ?? 0)).toBe(PARALLEL_MAX);
  });

  it('nests stepped parallel paths so their middle runs never cross', () => {
    // The target is lower and to the right: the paths step down.
    const rs = routes(card(0, 0), card(400, 200), 3);
    for (const r of rs) expect(r.center).not.toBeNull();
    const centers = rs.map((r) => r.center as number);
    expect(new Set(centers).size).toBe(3);
    // The topmost line (smallest y) turns last, so it never crosses the lines below it.
    expect(centers[0]).toBeGreaterThan(centers[1] as number);
    expect(centers[1]).toBeGreaterThan(centers[2] as number);
    // Stepping up, it's the other way round.
    const up = routes(card(0, 200), card(400, 0), 3).map((r) => r.center as number);
    expect(up[0]).toBeLessThan(up[1] as number);
  });

  it('leaves a lone relationship as it was', () => {
    const [lone] = routes(card(0, 0), card(320, 0), 1);
    expect(lone?.ends).toEqual(floatingEnds(card(0, 0), card(320, 0)));
    expect(lone?.offset).toBe(0);
  });
});

describe('self-relationships', () => {
  it('nests loops on one card so none overlap', () => {
    const r = card(0, 0);
    const loops = [0, 1, 2].map((index) => selfLoop(r, { index, count: 3 }));
    for (const [i, loop] of loops.entries()) {
      const outer = loops[i + 1];
      if (!outer) continue;
      // Each further loop is wider and taller, its ends further from the middle...
      expect(outer.ends.source.y).toBeLessThan(loop.ends.source.y);
      expect(outer.ends.target.y).toBeGreaterThan(loop.ends.target.y);
      expect(outer.points[1]?.x).toBeGreaterThan(loop.points[1]?.x as number);
      // ...with room for the inner loop's label above its top run, and for the markers.
      expect(loop.ends.source.y - outer.ends.source.y).toBe(SELF_LOOP_SPACING);
      expect(SELF_LOOP_SPACING).toBeGreaterThan(2 * MARKER.halfSpread);
    }
    // Every end is on the card's right side, past the markers before the loop turns.
    for (const loop of loops) {
      expect(loop.ends.source).toMatchObject({ x: 240, side: 'right' });
      expect(loop.points[1]?.x).toBeGreaterThan(240 + MARKER.extent);
    }
  });

  it('keeps a lone loop centred on the side', () => {
    const loop = selfLoop(card(0, 0), { index: 0, count: 1 });
    expect((loop.ends.source.y + loop.ends.target.y) / 2).toBe(60);
  });
});

describe('selfLoopSide', () => {
  const r = card(0, 0);
  it('prefers the right side when nothing is near', () => {
    expect(selfLoopSide(r, [])).toBe('right');
    expect(selfLoopSide(r, [card(0, 400)])).toBe('right');
  });

  it('moves off a side that has a card close by', () => {
    // A card 60 to the right: bottom is free.
    expect(selfLoopSide(r, [card(300, 0)])).toBe('bottom');
    // Right and below both crowded: left.
    expect(selfLoopSide(r, [card(300, 0), card(0, 160)])).toBe('left');
  });

  it('draws loops off any side, nested the same way', () => {
    for (const side of ['top', 'bottom', 'left'] as const) {
      const inner = selfLoop(r, { index: 0, count: 2 }, side);
      const outer = selfLoop(r, { index: 1, count: 2 }, side);
      expect(inner.ends.source.side).toBe(side);
      // The outer loop's far corner is further from the card than the inner one's.
      const reach = (p: { x: number; y: number } | undefined) =>
        side === 'top' ? -(p?.y ?? 0) : side === 'left' ? -(p?.x ?? 0) : (p?.y ?? 0);
      expect(reach(outer.points[1])).toBeGreaterThan(reach(inner.points[1]));
    }
    expect(selfLoop(r, { index: 0, count: 1 }, 'bottom').label.placement).toBe('below');
  });
});
