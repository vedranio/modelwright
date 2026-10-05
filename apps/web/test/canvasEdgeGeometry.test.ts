import { describe, expect, it } from 'vitest';
import { fanOffsets, orthogonalPath } from '../src/canvas/edgeGeometry';

describe('fanOffsets', () => {
  it('centres items that share a key on zero, spacing apart', () => {
    const items = [
      { id: 'a', k: 'x' },
      { id: 'b', k: 'x' },
      { id: 'c', k: 'x' },
      { id: 'd', k: 'y' },
    ];
    const offsets = fanOffsets(items, (i) => i.k, 10);
    expect([offsets.get('a'), offsets.get('b'), offsets.get('c')]).toEqual([-10, 0, 10]);
    expect(offsets.get('d')).toBe(0);
  });

  it('skips items with a null key', () => {
    expect(fanOffsets([{ id: 'a' }], () => null, 10).has('a')).toBe(false);
  });
});

describe('orthogonalPath', () => {
  it('draws a straight line through two points', () => {
    expect(
      orthogonalPath([
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ]),
    ).toBe('M 0 0 L 50 0');
  });

  it('rounds each corner', () => {
    const d = orthogonalPath(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      8,
    );
    expect(d).toBe('M 0 0 L 32 0 Q 40 0 40 8 L 40 40');
  });

  it('shrinks the radius on short segments', () => {
    const d = orthogonalPath(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 6 },
        { x: 80, y: 6 },
      ],
      8,
    );
    expect(d).toContain('Q 40 0 40 3');
  });

  it('drops repeated and collinear points', () => {
    expect(
      orthogonalPath([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 50, y: 0 },
      ]),
    ).toBe('M 0 0 L 50 0');
  });
});
