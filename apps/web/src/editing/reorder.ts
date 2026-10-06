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
