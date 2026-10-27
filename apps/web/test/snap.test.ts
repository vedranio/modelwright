import { describe, expect, it } from 'vitest';
import { boundsOf, snap } from '../src/canvas/snap';

const card = (x: number, y: number, width = 100, height = 60) => ({ x, y, width, height });

describe('snap', () => {
  it('lines up left edges within the threshold, with a vertical guide across both cards', () => {
    const { dx, dy, guides } = snap(card(104, 200), [card(100, 0)], 6);
    expect(dx).toBe(-4);
    expect(dy).toBe(0);
    expect(guides).toContainEqual({ axis: 'x', at: 100, from: 0, to: 260 });
  });

  it('lines up centres and bottoms too, on both axes at once', () => {
    // A 40-wide card whose centre is 3 off the other's (150), and its bottom 2 off (60).
    const { dx, dy } = snap(card(127, 2, 40, 60), [card(100, 0)], 6);
    expect(dx).toBe(3);
    expect(dy).toBe(-2);
  });

  it('picks the nearest of several candidates', () => {
    const { dx } = snap(card(203, 300), [card(100, 0), card(205, 100)], 6);
    expect(dx).toBe(2);
  });

  it('does nothing beyond the threshold', () => {
    expect(snap(card(110, 200), [card(100, 0)], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('shows guides for lines that already coincide', () => {
    const { dx, guides } = snap(card(100, 200), [card(100, 0)], 6);
    expect(dx).toBe(0);
    expect(guides.map((g) => g.at)).toEqual([100, 150, 200]);
  });

  it('has nothing to snap to with no other cards', () => {
    expect(snap(card(3, 3), [], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe('boundsOf', () => {
  it('is the union of the rectangles', () => {
    expect(boundsOf([card(0, 0), card(150, 100, 50, 10)])).toEqual(card(0, 0, 200, 110));
    expect(boundsOf([])).toBeNull();
  });
});
