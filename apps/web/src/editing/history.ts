/** Undo keeps about this many steps; older ones are dropped. */
export const HISTORY_CAP = 200;

/** Edits with the same coalesce key this close together (ms) land as one step. */
export const COALESCE_WINDOW_MS = 600;

/**
 * One document's undo history: the documents before each step (oldest first) and the ones
 * undone since (next to redo first). Pure, so it can be tested without React.
 */
export interface History<D> {
  past: readonly D[];
  future: readonly D[];
  /** The last step's coalesce key and when it was made, while it can still absorb edits. */
  coalesce: { key: string; at: number } | null;
}

export function emptyHistory<D>(): History<D> {
  return { past: [], future: [], coalesce: null };
}

/**
 * Records a step whose document before the edit was `previous`. A new step clears the redo
 * stack. When `key` matches the last step's key within the window, the edit joins that step
 * instead: a burst of nudges is one undo step.
 */
export function record<D>(
  history: History<D>,
  previous: D,
  options: { key?: string; now?: number } = {},
): History<D> {
  const { key, now = Date.now() } = options;
  const last = history.coalesce;
  if (key !== undefined && last?.key === key && now - last.at <= COALESCE_WINDOW_MS) {
    return { past: history.past, future: [], coalesce: { key, at: now } };
  }
  const past = [...history.past, previous];
  return {
    past: past.length > HISTORY_CAP ? past.slice(past.length - HISTORY_CAP) : past,
    future: [],
    coalesce: key === undefined ? null : { key, at: now },
  };
}

/** Steps back from `current`, or null when there's nothing to undo. */
export function undo<D>(history: History<D>, current: D): { history: History<D>; doc: D } | null {
  const doc = history.past[history.past.length - 1];
  if (doc === undefined) return null;
  return {
    doc,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
      coalesce: null,
    },
  };
}

/** Steps forward from `current`, or null when there's nothing to redo. */
export function redo<D>(history: History<D>, current: D): { history: History<D>; doc: D } | null {
  const [doc, ...future] = history.future;
  if (doc === undefined) return null;
  return { doc, history: { past: [...history.past, current], future, coalesce: null } };
}
