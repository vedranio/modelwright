import { stringifyDesign, type Issue } from '@modelwright/schema';
import type { DesignDoc, DesignKind } from '../platform/ProjectClient';

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
}

export function initialEditableState<K extends DesignKind>(): EditableState<K> {
  return { local: null, dirty: false, status: 'saved', issues: [] };
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

export function applyEdit<K extends DesignKind>(next: DesignDoc<K>): EditableState<K> {
  return { local: next, dirty: true, status: 'unsaved', issues: [] };
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
