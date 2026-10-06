import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectClient, type BuildRead } from '../platform';

export interface UseBuildRecord {
  /** `.design/build.json` as last read, or null until the first read lands. */
  read: BuildRead | null;
  /** Reads it again, e.g. after the CLI wrote it. */
  reload: () => Promise<void>;
}

/**
 * The project's build record, read on open and on window focus. The shell also reloads it when
 * the watcher reports `build.json` changed (a build finished) and on Reload. modelwright never
 * writes it.
 */
export function useBuildRecord(projectPath: string): UseBuildRecord {
  const client = useProjectClient();
  const [read, setRead] = useState<BuildRead | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    let next: BuildRead;
    try {
      next = await client.readBuildRecord(projectPath);
    } catch {
      // The server is unreachable; keep what was last known.
      return;
    }
    // A newer read has started, or the project changed; drop this stale result.
    if (request === latest.current) setRead(next);
  }, [client, projectPath]);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  return { read, reload };
}
