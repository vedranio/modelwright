import type { PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../Icon';
import { shortcutHint } from '../shortcutRegistry';
import { dropIndex, dropSlot } from './reorder';

/**
 * Drags a row by its grip to another place in its list. The list is the nearest
 * `[data-rows]` element and its rows are its `[data-row]` children; drafts aren't rows, so
 * they're never counted. A line shows where the row will go, Escape cancels, and dropping
 * calls `onMove` with how far the row moved (never 0).
 */
export function startRowDrag(
  event: ReactPointerEvent<HTMLElement>,
  onMove: (offset: number) => void,
) {
  if (event.button !== 0) return;
  const grip = event.currentTarget;
  const row = grip.closest<HTMLElement>('[data-row]');
  const list = row?.closest<HTMLElement>('[data-rows]');
  if (!row || !list) return;
  event.preventDefault();
  event.stopPropagation();
  const rows = Array.from(list.querySelectorAll<HTMLElement>(':scope > [data-row]'));
  const from = rows.indexOf(row);
  if (from < 0) return;
  const mids = rows.map((r) => {
    const rect = r.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });

  let to = from;
  const clear = () => {
    for (const r of rows) r.classList.remove('drop-before', 'drop-after');
  };
  const mark = () => {
    clear();
    if (to === from) return;
    const slot = dropSlot(to, from);
    if (slot < rows.length) rows[slot]?.classList.add('drop-before');
    else rows.at(-1)?.classList.add('drop-after');
  };
  const onPointerMove = (e: PointerEvent) => {
    to = dropIndex(mids, e.clientY, from);
    mark();
  };
  const finish = (drop: boolean) => {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('keydown', onKeyDown, true);
    clear();
    row.classList.remove('row-dragged');
    list.classList.remove('rows-dragging');
    if (drop && to !== from) onMove(to - from);
  };
  const onPointerUp = () => finish(true);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    finish(false);
  };
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('keydown', onKeyDown, true);
  row.classList.add('row-dragged');
  list.classList.add('rows-dragging');
}

/** The grip a row is dragged by. It shows with the row's other hover controls. */
export function RowGrip({
  className,
  onMove,
}: {
  className: string;
  onMove: (offset: number) => void;
}) {
  return (
    <span
      className={`${className} row-grip nodrag`}
      role="button"
      aria-label="Drag to reorder"
      title={`Drag to reorder (or ${shortcutHint('move-row')} while editing)`}
      onPointerDown={(e) => startRowDrag(e, onMove)}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="drag_indicator" />
    </span>
  );
}
