import { describe, expect, it } from 'vitest';
import { dropIndex, dropSlot, moveItem } from '../src/editing/reorder';

// Four rows, 20 units tall, starting at 0: midpoints at 10, 30, 50 and 70.
const mids = [10, 30, 50, 70];

describe('dropIndex', () => {
  it('stays put over the dragged row itself', () => {
    expect(dropIndex(mids, 22, 1)).toBe(1);
    expect(dropIndex(mids, 38, 1)).toBe(1);
  });

  it('moves up before the row whose midpoint is below the pointer', () => {
    expect(dropIndex(mids, 5, 2)).toBe(0);
    expect(dropIndex(mids, 25, 2)).toBe(1);
  });

  it('moves down, counting the gap the row leaves', () => {
    expect(dropIndex(mids, 55, 0)).toBe(2);
    expect(dropIndex(mids, 200, 0)).toBe(3);
  });

  it('agrees with moveItem: the row ends up at the index returned', () => {
    const rows = ['a', 'b', 'c', 'd'];
    for (let from = 0; from < rows.length; from++) {
      for (const y of [0, 15, 35, 55, 75, 90]) {
        const to = dropIndex(mids, y, from);
        const moved = to === from ? rows : moveItem(rows, from, to - from);
        expect(moved?.indexOf(rows[from] as string)).toBe(to);
      }
    }
  });
});

describe('dropSlot', () => {
  it('is the gap the line shows in, before row `slot`', () => {
    expect(dropSlot(0, 2)).toBe(0);
    expect(dropSlot(2, 0)).toBe(3);
    expect(dropSlot(3, 0)).toBe(4);
  });
});
