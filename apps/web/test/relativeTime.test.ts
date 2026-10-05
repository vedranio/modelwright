import { describe, expect, it } from 'vitest';
import { relativeTime } from '../src/relativeTime';

/** A local-time date, so the tests hold in any time zone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const now = at(2026, 10, 5, 9);

describe('relativeTime', () => {
  it.each([
    [at(2026, 10, 5, 0), 'today'],
    [at(2026, 10, 5, 23), 'today'],
    [at(2026, 10, 4, 23), 'yesterday'],
    [at(2026, 10, 4, 0), 'yesterday'],
    [at(2026, 10, 3), '2 days ago'],
    [at(2026, 9, 29), '6 days ago'],
    [at(2026, 9, 28), 'last week'],
    [at(2026, 9, 22), 'last week'],
    [at(2026, 9, 21), '2 weeks ago'],
    [at(2026, 9, 6), '4 weeks ago'],
    [at(2026, 9, 5), 'last month'],
    [at(2026, 8, 7), 'last month'],
    [at(2026, 8, 6), '2 months ago'],
    [at(2025, 10, 6), '12 months ago'],
    [at(2025, 10, 5), 'last year'],
    [at(2024, 10, 6), 'last year'],
    [at(2024, 10, 5), '2 years ago'],
  ])('%s → %s', (then, expected) => {
    expect(relativeTime(then, now)).toBe(expected);
  });

  it('counts calendar days, not 24-hour periods', () => {
    expect(relativeTime(at(2026, 10, 4, 23), at(2026, 10, 5, 0))).toBe('yesterday');
  });

  it('treats the future as today', () => {
    expect(relativeTime(at(2026, 10, 7), now)).toBe('today');
  });
});
