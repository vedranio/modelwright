import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useConfirm } from '../ConfirmDialog';
import {
  ProjectClientError,
  useProjectClient,
  type DevServerEvent,
  type DevServerState,
} from '../platform';

/** The log keeps this many lines, as the host does. */
const MAX_LINES = 500;

export interface DevServer {
  state: DevServerState;
  /** Its output, oldest first. */
  lines: string[];
  /** A start or stop is under way. */
  busy: boolean;
  /** Why the last start or stop failed. */
  error: string | null;
  /** Starts it, asking first if its command isn't approved for this project yet. */
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** The approval dialog, to render. */
  dialog: ReactNode;
}

/**
 * The project's dev server: its state and output as the host reports them, and Start and Stop.
 * Start runs `config.json`'s command, never anything typed here. A command not yet approved
 * for the project asks first, showing exactly what will run and where.
 */
export function useDevServer(projectPath: string): DevServer {
  const client = useProjectClient();
  const [state, setState] = useState<DevServerState>({ status: 'idle' });
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, confirm] = useConfirm();

  useEffect(
    () =>
      client.devServer.watch(projectPath, (event: DevServerEvent) => {
        if (event.type === 'snapshot') {
          setState(event.state);
          setLines(event.lines.slice(-MAX_LINES));
        } else if (event.type === 'state') {
          setState(event.state);
        } else {
          setLines((current) => [...current, ...event.lines].slice(-MAX_LINES));
        }
      }),
    [client, projectPath],
  );

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await client.devServer.start(projectPath, false);
      if (result.status === 'needs-approval') {
        const ok = await confirm({
          title: 'Run this command?',
          message: (
            <>
              <p>modelwright will run your project’s dev command:</p>
              <code className="approve-command">{result.command}</code>
              <p>
                in <code>{result.cwd}</code>. It runs in your shell, with your permissions. It’s
                asked once for each project, and again whenever the command changes.
              </p>
            </>
          ),
          confirmLabel: 'Run',
        });
        if (ok) await client.devServer.start(projectPath, true);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }, [client, projectPath, confirm]);

  const stop = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await client.devServer.stop(projectPath);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }, [client, projectPath]);

  return { state, lines, busy, error, start, stop, dialog };
}

function messageOf(err: unknown): string {
  if (err instanceof ProjectClientError) return err.message;
  return err instanceof Error ? err.message : String(err);
}
