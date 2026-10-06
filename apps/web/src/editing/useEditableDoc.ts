import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseDesign, type Issue } from '@modelwright/schema';
import { useProjectClient, type DesignDoc } from '../platform';
import type { DocState } from '../docState';
import {
  applyEdit,
  historyFor,
  initialEditableState,
  redoEdit,
  resolveDoc,
  undoEdit,
  saveFailed,
  saveRefused,
  saveStarted,
  saveSucceeded,
  type EditableState,
  type SaveStatus,
} from './editableState';

export type { SaveStatus };

/**
 * Every design file has an editor. The canvases autosave after a pause; config edits are
 * discrete commits (Enter or blur) and pass `saveNow`.
 */
export type EditableKind = 'erd' | 'flows' | 'config';

/** About this long after the last edit, the document saves. */
export const AUTOSAVE_DELAY_MS = 500;

export interface EditableDoc<K extends EditableKind> {
  /** The document to show and edit: the local copy while there is one, else what's on disk. */
  doc: DesignDoc<K> | null;
  /**
   * Applies an edit to the local copy, as one undo step, and schedules a save (or saves right
   * away). Edits with the same `coalesce` key in quick succession are one step.
   */
  apply: (edit: (doc: DesignDoc<K>) => DesignDoc<K>, options?: ApplyOptions) => void;
  /** Steps back one edit. Returns the documents before and after, or null if there was none. */
  undo: () => UndoStep<K> | null;
  /** Steps forward one undone edit, or returns null. */
  redo: () => UndoStep<K> | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Counts edits, undos and redos. */
  revision: number;
  /** The latest revision, including an `apply` made moments ago in the same handler. */
  currentRevision: () => number;
  status: SaveStatus;
  /** Validation problems when `status` is `invalid`. */
  issues: Issue[];
  /** True while there are edits not yet on disk. */
  dirty: boolean;
  /** Saves now if there's anything to save. Resolves true once everything is on disk. */
  flush: () => Promise<boolean>;
  /** Drops the local copy and its unsaved edits, falling back to what's on disk. */
  discard: () => void;
}

export interface ApplyOptions {
  saveNow?: boolean;
  coalesce?: string;
}

export interface UndoStep<K extends EditableKind> {
  before: DesignDoc<K>;
  after: DesignDoc<K>;
}

/**
 * A local working copy of one design document, layered on useDesign's on-disk state. Edits
 * apply locally at once and autosave through ProjectClient.writeDesign about 500 ms after the
 * last one. While there are unsaved edits, the local copy wins: a newer on-disk document is
 * ignored until the edits are saved or discarded. The state logic is in editableState.ts.
 *
 * `noteWritten` tells useDesign what each save put on disk, so `remote` stays true to the file
 * and a later re-read that differs from it (say, a revert by hand) takes over.
 */
export function useEditableDoc<K extends EditableKind>(
  kind: K,
  projectPath: string,
  remote: DocState<K>,
  noteWritten: (kind: K, doc: DesignDoc<K>) => void,
): EditableDoc<K> {
  const client = useProjectClient();
  const [state, setState] = useState<EditableState<K>>(initialEditableState);

  const remoteDoc = remote.status === 'ok' ? remote.doc : null;
  const doc = useMemo(() => resolveDoc(kind, state, remoteDoc), [kind, state, remoteDoc]);

  // Event handlers and timers read the latest values through refs.
  const latest = useRef({ state, doc });
  useLayoutEffect(() => {
    latest.current = { state, doc };
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const saveAgain = useRef(false);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Writes the latest local copy once, if it's dirty and valid. Resolves false on failure. */
  const writeLatest = useCallback(async (): Promise<boolean> => {
    const { state: current } = latest.current;
    const target = current.local;
    if (!current.dirty || !target) return true;

    const parsed = parseDesign(kind, target);
    if (!parsed.ok) {
      console.error(`Refusing to save an invalid ${kind}.json`, parsed.error.issues);
      setState((s) => saveRefused(s, parsed.error.issues));
      return false;
    }

    setState(saveStarted);
    try {
      await client.writeDesign(projectPath, kind, target);
      noteWritten(kind, target);
      setState((s) => saveSucceeded(s, target));
      return true;
    } catch {
      setState(saveFailed);
      saveAgain.current = false;
      return false;
    }
  }, [client, kind, projectPath, noteWritten]);

  /** Saves now. One write at a time: a save requested mid-write runs once that one settles. */
  const save = useCallback((): Promise<boolean> => {
    clearTimer();
    if (inFlight.current) {
      saveAgain.current = true;
      return inFlight.current;
    }
    const run = async () => {
      let ok: boolean;
      do {
        saveAgain.current = false;
        ok = await writeLatest();
      } while (saveAgain.current);
      return ok;
    };
    const promise = run().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = promise;
    return promise;
  }, [writeLatest]);

  /** Makes `nextState` current and schedules its save. */
  const commit = useCallback(
    (nextState: EditableState<K>, next: DesignDoc<K>, saveNow: boolean) => {
      // Update the ref at once so a save scheduled below, or a second call, sees this edit.
      latest.current = { ...latest.current, state: nextState, doc: next };
      setState(nextState);
      clearTimer();
      timer.current = setTimeout(() => void save(), saveNow ? 0 : AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  const apply = useCallback<EditableDoc<K>['apply']>(
    (edit, options) => {
      const { doc: current } = latest.current;
      if (!current) return;
      const next = edit(current);
      if (next === current) return;
      const nextState = applyEdit(latest.current.state, current, next, {
        ...(options?.coalesce !== undefined && { coalesce: options.coalesce }),
      });
      commit(nextState, next, options?.saveNow ?? false);
    },
    [commit],
  );

  const step = useCallback(
    (move: typeof undoEdit): UndoStep<K> | null => {
      const { state: current, doc: before } = latest.current;
      const nextState = move(current, before);
      if (!nextState?.local || !before) return null;
      const after = nextState.local;
      commit(nextState, after, false);
      return { before, after };
    },
    [commit],
  );
  const undo = useCallback(() => step(undoEdit), [step]);
  const redo = useCallback(() => step(redoEdit), [step]);
  const currentRevision = useCallback(() => latest.current.state.revision, []);

  const flush = useCallback(() => save(), [save]);

  const discard = useCallback(() => {
    clearTimer();
    setState(initialEditableState<K>());
  }, []);

  // Warn before the page unloads with edits that aren't on disk.
  useEffect(() => {
    if (!state.dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state.dirty]);

  useEffect(() => clearTimer, []);

  const history = historyFor(state, doc);
  return {
    doc,
    apply,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    revision: state.revision,
    currentRevision,
    status: state.status,
    issues: state.issues,
    dirty: state.dirty,
    flush,
    discard,
  };
}
