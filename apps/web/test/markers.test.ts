import { describe, expect, it } from 'vitest';
import { Cardinality } from '@modelwright/schema';
import { MARKER, cardinalityMarker, markerShapes } from '../src/erd/markers';

describe('cardinalityMarker', () => {
  it.each([
    ['one', { inner: 'bar', outer: 'bar' }],
    ['zero-one', { inner: 'bar', outer: 'circle' }],
    ['many', { inner: 'crow', outer: 'bar' }],
    ['zero-many', { inner: 'crow', outer: 'circle' }],
  ] as const)('%s → %o', (card, expected) => {
    expect(cardinalityMarker(card)).toEqual(expected);
  });

  it('covers every cardinality in the schema', () => {
    for (const card of Cardinality.options) expect(cardinalityMarker(card)).toBeDefined();
  });
});

describe('markerShapes', () => {
  const lines = (card: Cardinality) => markerShapes(card).filter((s) => s.kind === 'line');
  const circles = (card: Cardinality) => markerShapes(card).filter((s) => s.kind === 'circle');

  it('draws one as two bars and no circle', () => {
    expect(lines('one')).toHaveLength(2);
    expect(circles('one')).toHaveLength(0);
  });

  it('draws zero-one as one bar and a circle further out', () => {
    expect(lines('zero-one')).toHaveLength(1);
    const [circle] = circles('zero-one');
    const [bar] = lines('zero-one');
    expect(circle?.kind === 'circle' && bar?.kind === 'line' && circle.cx > bar.x1).toBe(true);
  });

  it('draws many as a crow’s foot touching the card plus a bar', () => {
    const shapes = lines('many');
    expect(shapes).toHaveLength(4);
    expect(shapes.filter((s) => s.kind === 'line' && s.x1 === 0)).toHaveLength(3);
    expect(circles('many')).toHaveLength(0);
  });

  it('draws zero-many as a crow’s foot plus a circle', () => {
    expect(lines('zero-many')).toHaveLength(3);
    expect(circles('zero-many')).toHaveLength(1);
  });

  it('keeps every shape within the marker extent, on the line side of the card', () => {
    for (const card of Cardinality.options) {
      for (const s of markerShapes(card)) {
        const xs = s.kind === 'line' ? [s.x1, s.x2] : [s.cx - s.r, s.cx + s.r];
        for (const x of xs) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(MARKER.extent);
        }
      }
    }
  });
});
