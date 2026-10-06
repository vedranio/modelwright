import { useCallback, useEffect, useRef, useState } from 'react';
import { DESIGN_KINDS } from '@modelwright/schema';
import { keepUnchanged, type DocState } from './docState';
import {
  ProjectClientError,
  useProjectClient,
  type DesignDoc,
  type DesignKind,
  type ProjectClient,
} from './platform';

export type { DocState };

export type DesignState = { [K in DesignKind]: DocState<K> };

const ALL_LOADING: DesignState = {
  erd: { status: 'loading' },
  flows: { status: 'loading' },
  config: { status: 'loading' },
};

export interface UseDesign {
  docs: DesignState;
  /** Re-reads all three files from disk. */
  reload: () => Promise<void>;
  /** Re-reads one file, e.g. after it changed on disk. */
  reloadOne: (kind: DesignKind) => Promise<void>;
  /** Pauses re-reading on window focus, e.g. while the user is typing a new name. */
  setFocusReloadPaused: (paused: boolean) => void;
  /**
   * Records that `doc` was just written to disk, so the on-disk state stays true without a
   * re-read. A re-read already in flight keeps this instead of its result for that file: it
   * may have read the file before the write landed.
   */
  noteWritten: <K extends DesignKind>(kind: K, doc: DesignDoc<K>) => void;
}

export function useDesign(projectPath: string): UseDesign {
  const client = useProjectClient();
  const [docs, setDocs] = useState<DesignState>(ALL_LOADING);
  const latest = useRef(0);
  const writes = useRef<Record<DesignKind, number>>({ erd: 0, flows: 0, config: 0 });
  const focusPaused = useRef(false);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    const writesAtStart = { ...writes.current };
    const results = await Promise.all(
      DESIGN_KINDS.map((kind) => loadDoc(client, projectPath, kind)),
    );
    // A newer reload (or a project switch) has started; drop this stale result.
    if (request !== latest.current) return;
    const next = { erd: results[0], flows: results[1], config: results[2] } as DesignState;
    const writtenSince = (kind: DesignKind) => writes.current[kind] !== writesAtStart[kind];
    // A file whose content hasn't changed keeps its previous object, so nothing re-renders.
    setDocs((prev) => ({
      erd: writtenSince('erd') ? prev.erd : keepUnchanged('erd', prev.erd, next.erd),
      flows: writtenSince('flows') ? prev.flows : keepUnchanged('flows', prev.flows, next.flows),
      config: writtenSince('config')
        ? prev.config
        : keepUnchanged('config', prev.config, next.config),
    }));
  }, [client, projectPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reloadOne = useCallback(
    async (kind: DesignKind) => {
      const project = latest.current;
      const writesAtStart = writes.current[kind];
      const result = await loadDoc(client, projectPath, kind);
      // A newer full reload, or a save of ours, has the fresher state.
      if (project !== latest.current || writes.current[kind] !== writesAtStart) return;
      setDocs((prev) => ({ ...prev, [kind]: keepUnchanged(kind, prev[kind], result) }));
    },
    [client, projectPath],
  );

  useEffect(() => {
    const onFocus = () => {
      if (!focusPaused.current) void reload();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const setFocusReloadPaused = useCallback((paused: boolean) => {
    focusPaused.current = paused;
  }, []);

  const noteWritten = useCallback(<K extends DesignKind>(kind: K, doc: DesignDoc<K>) => {
    writes.current[kind]++;
    setDocs((prev) => ({ ...prev, [kind]: { status: 'ok', doc } }));
  }, []);

  return { docs, reload, reloadOne, setFocusReloadPaused, noteWritten };
}

async function loadDoc<K extends DesignKind>(
  client: ProjectClient,
  projectPath: string,
  kind: K,
): Promise<DocState<K>> {
  try {
    return { status: 'ok', doc: await client.readDesign(projectPath, kind) };
  } catch (err) {
    if (err instanceof ProjectClientError && err.issues) {
      return { status: 'invalid', issues: err.issues };
    }
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
