const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long ago `then` was, in calendar days in the local time zone: "today", "yesterday",
 * "3 days ago", "last week", "2 weeks ago", "last month", "4 months ago", "last year"…
 * Timestamps in the future (clock skew) read as "today".
 */
export function relativeTime(then: Date, now: Date): string {
  const days = Math.round((localDay(now) - localDay(then)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'last month';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  if (days < 730) return 'last year';
  return `${Math.floor(days / 365)} years ago`;
}

/** Midnight UTC of the local calendar date, so DST shifts don't skew day counts. */
function localDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
