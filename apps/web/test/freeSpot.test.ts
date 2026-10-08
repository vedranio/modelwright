import { describe, expect, it } from 'vitest';
import { besideAnchor, nudgeClear, overlaps } from '../src/canvas/freeSpot';
import { PLACEMENT_GAP } from '../src/canvas/placement';

const card = (x: number, y: number, width = 240, height = 120) => ({ x, y, width, height });
const size = { width: 240, height: 120 };

describe('overlaps', () => {
  it('keeps a margin between cards', () => {
    expect(overlaps(card(0, 0), card(250, 0))).toBe(true);
    expect(overlaps(card(0, 0), card(260, 0))).toBe(false);
    expect(overlaps(card(0, 0), card(0, 140))).toBe(false);
  });
});

describe('nudgeClear', () => {
  it('keeps a spot that overlaps nothing', () => {
    expect(nudgeClear([card(0, 0)], { x: 0, y: 400 }, size)).toEqual({ x: 0, y: 400 });
  });

  it('moves past a card it would land on', () => {
    expect(nudgeClear([card(0, 0)], { x: 20, y: 10 }, size)).toEqual({
      x: 240 + PLACEMENT_GAP,
      y: 10,
    });
  });

  it('moves past several cards in a row, never landing on one', () => {
    const rects = [card(0, 0), card(304, 0), card(608, 0)];
    const spot = nudgeClear(rects, { x: 10, y: 0 }, size);
    expect(spot).toEqual({ x: 608 + 240 + PLACEMENT_GAP, y: 0 });
    expect(rects.some((r) => overlaps({ ...spot, ...size }, r))).toBe(false);
  });

  it('rounds to whole canvas units', () => {
    expect(nudgeClear([], { x: 10.6, y: -3.2 }, size)).toEqual({ x: 11, y: -3 });
  });
});

describe('besideAnchor', () => {
  it('goes to the right of the anchor, top-aligned', () => {
    const anchor = card(100, 50);
    expect(besideAnchor([anchor], anchor, size)).toEqual({ x: 340 + PLACEMENT_GAP, y: 50 });
  });

  it('skips past a card already beside the anchor', () => {
    const anchor = card(0, 0);
    const neighbour = card(240 + PLACEMENT_GAP, 0);
    const spot = besideAnchor([anchor, neighbour], anchor, size);
    expect(spot.x).toBe(neighbour.x + 240 + PLACEMENT_GAP);
  });
});
