/**
 * Moves the item at `from` by `offset` places, or returns null when it can't move (out of
 * range, or already at that end). A pure helper for the row-reordering operations.
 */
export function moveItem<T>(items: readonly T[], from: number, offset: number): T[] | null {
  const to = from + offset;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || offset === 0) {
    return null;
  }
  const next = [...items];
  const [item] = next.splice(from, 1) as [T];
  next.splice(to, 0, item);
  return next;
}

/** One grid step: how far a duplicate sits from its original, in canvas units. */
export const DUPLICATE_OFFSET = 16;

/**
 * Where a dragged row lands. `mids` are the rows' vertical midpoints in order, `y` is the
 * pointer and `from` is the dragged row's index. The row goes before the first row whose
 * midpoint is below the pointer; the result is its index once moved, as `moveItem` counts.
 */
export function dropIndex(mids: readonly number[], y: number, from: number): number {
  const slot = mids.filter((mid) => mid < y).length;
  return slot > from ? slot - 1 : slot;
}

/** The insertion slot (0 to rows) a landing index shows as, for the drop line. */
export function dropSlot(to: number, from: number): number {
  return to > from ? to + 1 : to;
}
