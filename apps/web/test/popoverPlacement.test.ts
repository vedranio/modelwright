import { describe, expect, it } from 'vitest';
import { POPOVER_GAP, POPOVER_MARGIN, placePopover } from '../src/canvas/popoverPlacement';

const size = { width: 240, height: 200 };
const bounds = { width: 1000, height: 700 };

describe('placePopover', () => {
  it('centres the popover under the point when there is room', () => {
    expect(placePopover({ x: 500, y: 100 }, size, bounds)).toEqual({
      x: 380,
      y: 100 + POPOVER_GAP,
    });
  });

  it('goes above the point when there is no room below', () => {
    expect(placePopover({ x: 500, y: 650 }, size, bounds)).toEqual({
      x: 380,
      y: 650 - POPOVER_GAP - 200,
    });
  });

  it('stays inside the canvas when the point is near or past an edge', () => {
    expect(placePopover({ x: 5, y: 100 }, size, bounds).x).toBe(POPOVER_MARGIN);
    expect(placePopover({ x: 990, y: 100 }, size, bounds).x).toBe(1000 - 240 - POPOVER_MARGIN);
    expect(placePopover({ x: -400, y: -300 }, size, bounds)).toEqual({
      x: POPOVER_MARGIN,
      y: POPOVER_MARGIN,
    });
    expect(placePopover({ x: 2000, y: 2000 }, size, bounds)).toEqual({
      x: 1000 - 240 - POPOVER_MARGIN,
      y: 700 - 200 - POPOVER_MARGIN,
    });
  });

  it('pins to the top-left margin when the canvas is smaller than the popover', () => {
    expect(placePopover({ x: 50, y: 50 }, size, { width: 200, height: 150 })).toEqual({
      x: POPOVER_MARGIN,
      y: POPOVER_MARGIN,
    });
  });
});
