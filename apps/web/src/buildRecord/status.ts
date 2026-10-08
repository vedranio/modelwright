import type { BuildRead, Issue } from '@modelwright/schema';
import { changeCount, diffDesign, type Design, type DesignDiff } from '@modelwright/spec';
import { relativeTime } from '../relativeTime';

/** What the header says about the last build, and what the popover shows. */
export type BuildStatus =
  | { kind: 'loading' }
  | { kind: 'none'; text: string }
  | { kind: 'up-to-date'; text: string; builtAt: string }
  | { kind: 'changed'; text: string; builtAt: string; count: number; diff: DesignDiff }
  | { kind: 'invalid-record'; text: string; issues: Issue[] }
  | { kind: 'design-problems'; text: string; builtAt: string };

/**
 * The build indicator's state: the build record (or null while it loads) against the design
 * being edited, unsaved edits included (or null when any of the three documents isn't
 * available, because it's loading or invalid).
 */
export function buildStatus(
  read: BuildRead | null,
  design: Design | null,
  designLoading: boolean,
  now: Date,
): BuildStatus {
  if (read === null) return { kind: 'loading' };
  if (read.status === 'none') return { kind: 'none', text: 'Not built yet' };
  if (read.status === 'invalid') {
    return { kind: 'invalid-record', text: 'build.json has problems', issues: read.issues };
  }
  const { builtAt, snapshot } = read.record;
  if (designLoading) return { kind: 'loading' };
  if (!design) {
    return { kind: 'design-problems', text: 'Can’t compare — the design has problems', builtAt };
  }
  const diff = diffDesign(snapshot, design);
  const count = changeCount(diff);
  if (count === 0) {
    return { kind: 'up-to-date', text: `Built ${builtAgo(new Date(builtAt), now)}`, builtAt };
  }
  return {
    kind: 'changed',
    text: `${count} ${count === 1 ? 'change' : 'changes'} since last build`,
    builtAt,
    count,
    diff,
  };
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long ago a build was: "just now", "12 minutes ago" and "3 hours ago" under a day, then
 * the picker's calendar-day wording ("yesterday", "3 days ago"…). A time in the future (clock
 * skew) is "just now".
 */
export function builtAgo(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  if (ms < MINUTE_MS) return 'just now';
  if (ms < HOUR_MS) {
    const minutes = Math.floor(ms / MINUTE_MS);
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  return relativeTime(then, now);
}
