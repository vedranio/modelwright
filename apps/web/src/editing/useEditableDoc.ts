import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseDesign, stringifyDesign, type Issue } from '@modelwright/schema';
import { useProjectClient, type DesignDoc } from '../platform';
import type { DocState } from '../useDesign';

/** The documents that have editors. Config is edited through its own small form. */
export type EditableKind = 'erd' | 'flows';

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

/** About this long after the last edit, the document saves. */
export const AUTOSAVE_DELAY_MS = 500;

export interface EditableDoc<K extends EditableKind> {
  /** The document to show and edit: the local copy while there is one, else what's on disk. */
  doc: DesignDoc<K> | null;
  /** Applies an edit to the local copy and schedules a save (or saves right away). */
  apply: (edit: (doc: DesignDoc<K>) => DesignDoc<K>, options?: { saveNow?: boolean }) => void;
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

interface State<K extends EditableKind> {
  /** The working copy; null until the first edit. */
  local: DesignDoc<K> | null;
  /** The on-disk document the working copy was made from. */
  base: DesignDoc<K> | null;
  dirty: boolean;
  status: SaveStatus;
  issues: Issue[];
}

/**
 * A local working copy of one design document, layered on useDesign's on-disk state. Edits
 * apply locally at once and autosave through ProjectClient.writeDesign about 500 ms after the
 * last one. While there are unsaved edits, the local copy wins: a newer on-disk document is
 * ignored until the edits are saved or discarded. Generic so the flow editor can reuse it.
 */
export function useEditableDoc<K extends EditableKind>(
  kind: K,
  projectPath: string,
  remote: DocState<K>,
): EditableDoc<K> {
  const client = useProjectClient();
  const [state, setState] = useState<State<K>>({
    local: null,
    base: null,
    dirty: false,
    status: 'saved',
    issues: [],
  });

  const remoteDoc = remote.status === 'ok' ? remote.doc : null;
  const doc = useMemo(() => {
    const { local, base, dirty } = state;
    if (!local) return remoteDoc;
    if (dirty || base === remoteDoc || !remoteDoc) return local;
    // A newer on-disk document arrived while clean. Keep the local object if it's the same
    // content (typically our own save read back), so the canvas doesn't re-render.
    return stringifyDesign(kind, local) === stringifyDesign(kind, remoteDoc) ? local : remoteDoc;
  }, [kind, state, remoteDoc]);

  // Event handlers and timers read the latest values through refs.
  const latest = useRef({ state, doc, remoteDoc });
  useLayoutEffect(() => {
    latest.current = { state, doc, remoteDoc };
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
      setState((s) => ({ ...s, status: 'invalid', issues: parsed.error.issues }));
      return false;
    }

    setState((s) => ({ ...s, status: 'saving' }));
    try {
      await client.writeDesign(projectPath, kind, target);
      // Edits made during the write keep the document dirty for the next save.
      setState((s) =>
        s.local === target ? { ...s, dirty: false, status: 'saved', issues: [] } : s,
      );
      return true;
    } catch {
      setState((s) => ({ ...s, status: 'failed' }));
      saveAgain.current = false;
      return false;
    }
  }, [client, kind, projectPath]);

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

  const apply = useCallback<EditableDoc<K>['apply']>(
    (edit, options) => {
      const { doc: current, remoteDoc: onDisk, state: s } = latest.current;
      if (!current) return;
      const next = edit(current);
      if (next === current) return;
      const base = s.dirty ? s.base : onDisk;
      const nextState: State<K> = { local: next, base, dirty: true, status: 'unsaved', issues: [] };
      // Update the ref at once so a save scheduled below sees this edit.
      latest.current = { ...latest.current, state: nextState, doc: next };
      setState(nextState);
      clearTimer();
      timer.current = setTimeout(() => void save(), options?.saveNow ? 0 : AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  const flush = useCallback(() => save(), [save]);

  const discard = useCallback(() => {
    clearTimer();
    setState({ local: null, base: null, dirty: false, status: 'saved', issues: [] });
  }, []);

  // Warn before the page unloads with edits that aren't on disk.
  useEffect(() => {
    if (!state.dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state.dirty]);

  useEffect(() => clearTimer, []);

  return {
    doc,
    apply,
    status: state.status,
    issues: state.issues,
    dirty: state.dirty,
    flush,
    discard,
  };
}
