import { useCallback, useEffect, useRef, useState } from 'react';
import { DESIGN_KINDS, stringifyDesign, type Issue } from '@modelwright/schema';
import {
  ProjectClientError,
  useProjectClient,
  type DesignDoc,
  type DesignKind,
  type ProjectClient,
} from './platform';

/** One design file as a view sees it. Each file loads independently, so one bad file can't break the others. */
export type DocState<K extends DesignKind> =
  | { status: 'loading' }
  | { status: 'ok'; doc: DesignDoc<K> }
  | { status: 'invalid'; issues: Issue[] }
  | { status: 'error'; message: string };

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
  /** Pauses re-reading on window focus, e.g. while the user is typing a new name. */
  setFocusReloadPaused: (paused: boolean) => void;
}

export function useDesign(projectPath: string): UseDesign {
  const client = useProjectClient();
  const [docs, setDocs] = useState<DesignState>(ALL_LOADING);
  const latest = useRef(0);
  const focusPaused = useRef(false);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    const results = await Promise.all(
      DESIGN_KINDS.map((kind) => loadDoc(client, projectPath, kind)),
    );
    // A newer reload (or a project switch) has started; drop this stale result.
    if (request !== latest.current) return;
    const next = { erd: results[0], flows: results[1], config: results[2] } as DesignState;
    // A file whose content hasn't changed keeps its previous object, so nothing re-renders.
    setDocs((prev) => ({
      erd: unchanged('erd', prev.erd, next.erd),
      flows: unchanged('flows', prev.flows, next.flows),
      config: unchanged('config', prev.config, next.config),
    }));
  }, [client, projectPath]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  return { docs, reload, setFocusReloadPaused };
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

/** `prev` when both states hold the same document (compared canonically), otherwise `next`. */
function unchanged<K extends DesignKind>(
  kind: K,
  prev: DocState<K>,
  next: DocState<K>,
): DocState<K> {
  if (prev.status === 'ok' && next.status === 'ok') {
    return stringifyDesign(kind, prev.doc) === stringifyDesign(kind, next.doc) ? prev : next;
  }
  return next;
}
