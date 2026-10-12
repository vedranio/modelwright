import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZE, MIN_SIZE, restoreBounds } from '../src/main/windowState';

const screen = { x: 0, y: 0, width: 1728, height: 1080 };
const second = { x: 1728, y: 0, width: 2560, height: 1440 };

describe('restoreBounds', () => {
  it('puts the window back where it was', () => {
    expect(restoreBounds({ x: 100, y: 50, width: 1400, height: 900 }, [screen])).toEqual({
      bounds: { x: 100, y: 50, width: 1400, height: 900 },
      maximized: false,
    });
  });

  it('remembers a maximised window', () => {
    expect(
      restoreBounds({ x: 0, y: 0, width: 1400, height: 900, maximized: true }, [screen]).maximized,
    ).toBe(true);
  });

  it('uses the default size when nothing (or nonsense) was saved', () => {
    for (const saved of [null, {}, { x: 'a' }, { x: 0, y: 0, width: -5, height: 10 }]) {
      expect(restoreBounds(saved, [screen])).toEqual({ bounds: DEFAULT_SIZE, maximized: false });
    }
  });

  it('falls back when its display is gone', () => {
    const onSecond = { x: 2000, y: 100, width: 1400, height: 900 };
    expect(restoreBounds(onSecond, [screen, second]).bounds).toEqual(onSecond);
    expect(restoreBounds(onSecond, [screen]).bounds).toEqual(DEFAULT_SIZE);
  });

  it('never restores smaller than the minimum', () => {
    const { bounds } = restoreBounds({ x: 10, y: 10, width: 300, height: 200 }, [screen]);
    expect(bounds.width).toBe(MIN_SIZE.width);
    expect(bounds.height).toBe(MIN_SIZE.height);
  });
});
