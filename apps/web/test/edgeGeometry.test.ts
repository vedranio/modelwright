import { describe, expect, it } from 'vitest';
import {
  CORNER_CLEARANCE,
  PARALLEL_SPACING,
  floatingEnds,
  parallelOffsets,
  sideAngle,
} from '../src/erd/edgeGeometry';

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

  it('centres offsets for relationships between the same pair, in either direction', () => {
    const offsets = parallelOffsets([
      { id: 'a', from: 'user', to: 'note' },
      { id: 'b', from: 'note', to: 'user' },
      { id: 'c', from: 'user', to: 'tag' },
      { id: 'self', from: 'note', to: 'note' },
    ]);
    expect(offsets.get('a')).toBe(-PARALLEL_SPACING / 2);
    expect(offsets.get('b')).toBe(PARALLEL_SPACING / 2);
    expect(offsets.get('c')).toBe(0);
    expect(offsets.has('self')).toBe(false);
  });
});
