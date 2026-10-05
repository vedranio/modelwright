import { describe, expect, it } from 'vitest';
import type { Screen } from '@modelwright/schema';
import {
  afterCta,
  afterSees,
  afterSeesDraft,
  ctaStart,
  nextStateStart,
  seesStart,
} from '../src/flows/tabOrder';

const screen: Screen = {
  id: 's',
  name: 'Login',
  states: [
    {
      id: 'a',
      name: 'Default',
      sees: ['email', 'password'],
      ctas: [
        { id: 'c1', label: 'Sign in' },
        { id: 'c2', label: 'Forgot' },
      ],
    },
    { id: 'b', name: 'Error', sees: [], ctas: [] },
  ],
};
const at = (stateId: string) => ({ screenId: 's', stateId });

describe('tab order', () => {
  it('enters a list at its first item, or a new draft when it is empty', () => {
    expect(seesStart(screen, 0)).toEqual({ kind: 'sees', ...at('a'), index: 0 });
    expect(seesStart(screen, 1)).toEqual({ kind: 'seesDraft', ...at('b'), after: null });
    expect(ctaStart(screen, 0)).toEqual({ kind: 'cta', ...at('a'), ctaId: 'c1' });
    expect(ctaStart(screen, 1)).toEqual({ kind: 'ctaDraft', ...at('b'), after: null });
  });

  it('moves through sees items, then on to the CTAs', () => {
    expect(afterSees(screen, 0, 0)).toEqual({ kind: 'sees', ...at('a'), index: 1 });
    expect(afterSees(screen, 0, 1)).toEqual({ kind: 'cta', ...at('a'), ctaId: 'c1' });
  });

  it('after a sees draft, goes to the item that followed it, else the CTAs', () => {
    // A draft after item 0 is inserted at 1; "password" moves to 2.
    expect(afterSeesDraft(screen, 0, 0)).toEqual({ kind: 'sees', ...at('a'), index: 2 });
    expect(afterSeesDraft(screen, 0, 1)).toEqual({ kind: 'cta', ...at('a'), ctaId: 'c1' });
    expect(afterSeesDraft(screen, 0, null)).toEqual({ kind: 'cta', ...at('a'), ctaId: 'c1' });
  });

  it('moves through CTAs, then to the next state’s name, then ends', () => {
    expect(afterCta(screen, 0, 'c1')).toEqual({ kind: 'cta', ...at('a'), ctaId: 'c2' });
    expect(afterCta(screen, 0, 'c2')).toEqual({ kind: 'stateName', ...at('b') });
    expect(afterCta(screen, 0, null)).toEqual({ kind: 'stateName', ...at('b') });
    expect(nextStateStart(screen, 1)).toBeNull();
    expect(afterCta(screen, 1, null)).toBeNull();
  });
});
