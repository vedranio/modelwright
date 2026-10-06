import { describe, expect, it } from 'vitest';
import { orthogonalPath } from '../src/canvas/edgeGeometry';

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
