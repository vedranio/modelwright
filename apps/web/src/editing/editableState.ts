import { stringifyDesign, type Issue } from '@modelwright/schema';
import type { DesignDoc, DesignKind } from '../platform/ProjectClient';
import { emptyHistory, record, redo, undo, type History } from './history';

export type SaveStatus =
  /** Everything is on disk. */
  | 'saved'
  /** Edits are waiting for the autosave. */
  | 'unsaved'
  | 'saving'
  /** The write failed (server down, disk error); edits are kept. */
  | 'failed'
  /** An edit produced a document that fails the schema. Not saved: that's a bug to fix. */
  | 'invalid';

/**
 * useEditableDoc's state, kept pure so it can be tested without React. The on-disk document
 * isn't part of it: that's useDesign's, which records our own writes (`noteWritten`), so it
 * always holds what's on disk as far as the tool knows.
 */
export interface EditableState<K extends DesignKind> {
  /** The working copy; null until the first edit. */
  local: DesignDoc<K> | null;
  dirty: boolean;
  status: SaveStatus;
  issues: Issue[];
  /** Undo history. It belongs to `local`: once disk replaces the working copy, it's void. */
  history: History<DesignDoc<K>>;
  /** Counts edits, undos and redos, so a toast can tell when the next edit happens. */
  revision: number;
}

export function initialEditableState<K extends DesignKind>(): EditableState<K> {
  return {
    local: null,
    dirty: false,
    status: 'saved',
    issues: [],
    history: emptyHistory(),
    revision: 0,
  };
}

/**
 * The document to show. While dirty, the working copy wins. Once clean, what's on disk wins
 * whenever its canonical text differs from the working copy's, whatever object identity says,
 * and a file that has become missing or invalid leaves nothing to edit. When the text is the
 * same (typically our own save read back), the working copy's object is kept so the canvas
 * doesn't re-render.
 */
export function resolveDoc<K extends DesignKind>(
  kind: K,
  state: EditableState<K>,
  onDisk: DesignDoc<K> | null,
): DesignDoc<K> | null {
  const { local, dirty } = state;
  if (!local) return onDisk;
  if (dirty) return local;
  // Clean, and the file is now missing or invalid: don't keep editing a stale copy of it.
  if (!onDisk) return null;
  if (local === onDisk) return local;
  return stringifyDesign(kind, local) === stringifyDesign(kind, onDisk) ? local : onDisk;
}

/**
 * The history that applies to `shown`, the document resolveDoc returned. When that isn't the
 * working copy, the file on disk has replaced it (a Reload, an external change, a reopen), and
 * the history describes a document that's gone, so it's empty.
 */
export function historyFor<K extends DesignKind>(
  state: EditableState<K>,
  shown: DesignDoc<K> | null,
): History<DesignDoc<K>> {
  return shown !== null && shown === state.local ? state.history : emptyHistory();
}

/**
 * `next` becomes the working copy, as one undo step from `shown` (what was on screen). Steps
 * with the same `coalesce` key in quick succession merge into one.
 */
export function applyEdit<K extends DesignKind>(
  state: EditableState<K>,
  shown: DesignDoc<K>,
  next: DesignDoc<K>,
  options: { coalesce?: string; now?: number } = {},
): EditableState<K> {
  const history = record(historyFor(state, shown), shown, {
    ...(options.coalesce !== undefined && { key: options.coalesce }),
    ...(options.now !== undefined && { now: options.now }),
  });
  return {
    local: next,
    dirty: true,
    status: 'unsaved',
    issues: [],
    history,
    revision: state.revision + 1,
  };
}

/** Steps back, or null when there's nothing to undo. Goes through the normal save path. */
export function undoEdit<K extends DesignKind>(
  state: EditableState<K>,
  shown: DesignDoc<K> | null,
): EditableState<K> | null {
  if (!shown) return null;
  const step = undo(historyFor(state, shown), shown);
  return step && moved(state, step);
}

/** Steps forward again, or null when there's nothing to redo. */
export function redoEdit<K extends DesignKind>(
  state: EditableState<K>,
  shown: DesignDoc<K> | null,
): EditableState<K> | null {
  if (!shown) return null;
  const step = redo(historyFor(state, shown), shown);
  return step && moved(state, step);
}

function moved<K extends DesignKind>(
  state: EditableState<K>,
  step: { history: History<DesignDoc<K>>; doc: DesignDoc<K> },
): EditableState<K> {
  return {
    local: step.doc,
    dirty: true,
    status: 'unsaved',
    issues: [],
    history: step.history,
    revision: state.revision + 1,
  };
}

export function saveStarted<K extends DesignKind>(s: EditableState<K>): EditableState<K> {
  return { ...s, status: 'saving' };
}

/** `target` is on disk. Edits made during the write keep the document dirty for the next save. */
export function saveSucceeded<K extends DesignKind>(
  s: EditableState<K>,
  target: DesignDoc<K>,
): EditableState<K> {
  return s.local === target ? { ...s, dirty: false, status: 'saved', issues: [] } : s;
}

export function saveFailed<K extends DesignKind>(s: EditableState<K>): EditableState<K> {
  return { ...s, status: 'failed' };
}

export function saveRefused<K extends DesignKind>(
  s: EditableState<K>,
  issues: Issue[],
): EditableState<K> {
  return { ...s, status: 'invalid', issues };
}
