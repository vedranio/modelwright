import { describe, expect, it } from 'vitest';
import type { Screen } from '@modelwright/schema';
import { SCREEN_WIDTH, estimateScreenSize } from '../src/flows/metrics';

function screen(states: { sees: number; ctas: number }[], notes?: string): Screen {
  return {
    id: 's',
    name: 'S',
    ...(notes !== undefined && { notes }),
    states: states.map((st, i) => ({
      id: `st${i}`,
      name: `State ${i}`,
      sees: Array.from({ length: st.sees }, (_, j) => `item ${j}`),
      ctas: Array.from({ length: st.ctas }, (_, j) => ({ id: `c${i}-${j}`, label: `CTA ${j}` })),
    })),
  };
}

const height = (s: Screen) => estimateScreenSize(s).height;

describe('estimateScreenSize', () => {
  it('is SCREEN_WIDTH wide', () => {
    expect(estimateScreenSize(screen([{ sees: 0, ctas: 0 }])).width).toBe(SCREEN_WIDTH);
  });

  it('grows with sees items', () => {
    expect(height(screen([{ sees: 3, ctas: 0 }]))).toBeGreaterThan(
      height(screen([{ sees: 1, ctas: 0 }])),
    );
  });

  it('grows with CTAs', () => {
    expect(height(screen([{ sees: 0, ctas: 4 }]))).toBeGreaterThan(
      height(screen([{ sees: 0, ctas: 1 }])),
    );
  });

  it('grows with states, more than the states’ contents alone once headers appear', () => {
    const one = height(screen([{ sees: 2, ctas: 2 }]));
    const two = height(
      screen([
        { sees: 2, ctas: 2 },
        { sees: 2, ctas: 2 },
      ]),
    );
    expect(two).toBeGreaterThan(2 * one - height(screen([])));
  });

  it('grows with notes', () => {
    expect(height(screen([{ sees: 0, ctas: 0 }], 'Some notes'))).toBeGreaterThan(
      height(screen([{ sees: 0, ctas: 0 }])),
    );
  });
});
