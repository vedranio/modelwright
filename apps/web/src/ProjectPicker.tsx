import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useProjectClient, type ProjectSummary } from './platform';

interface Props {
  onOpen: (project: ProjectSummary) => void;
  initialError?: string | null;
}

export function ProjectPicker({ onOpen, initialError = null }: Props) {
  const client = useProjectClient();
  const [recents, setRecents] = useState<ProjectSummary[] | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  /** A folder that was opened but has no `.design/` yet. */
  const [pending, setPending] = useState<ProjectSummary | null>(null);
  const [nameInput, setNameInput] = useState('');

  const loadRecents = useCallback(
    () =>
      client.listRecent().then(setRecents, (err: unknown) => {
        setRecents([]);
        setError(messageOf(err));
      }),
    [client],
  );

  useEffect(() => {
    void loadRecents();
  }, [loadRecents]);

  async function open(path: string) {
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const summary = await client.openProject(path);
      if (summary.initialised) {
        onOpen(summary);
      } else {
        setPending(summary);
        setNameInput(summary.name);
        void loadRecents();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function initialise(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      onOpen(await client.initProject(pending.path, nameInput));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    setError(null);
    try {
      await client.removeRecent(path);
      setRecents((list) => list?.filter((r) => r.path !== path) ?? null);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function submitPath(event: FormEvent) {
    event.preventDefault();
    const path = pathInput.trim();
    if (path) void open(path);
  }

  return (
    <main className="picker">
      <h1>modelwright</h1>

      <form className="picker-open" onSubmit={submitPath}>
        <label htmlFor="project-path">Project folder</label>
        <div className="row">
          <input
            id="project-path"
            type="text"
            placeholder="/absolute/path/to/project"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />
          <button type="submit" disabled={busy || pathInput.trim() === ''}>
            Open
          </button>
        </div>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {pending && (
        <form className="picker-init" onSubmit={initialise}>
          <p>
            <strong>{pending.path}</strong> doesn’t have a modelwright <code>.design/</code> folder
            yet.
          </p>
          <label htmlFor="project-name">Project name</label>
          <div className="row">
            <input
              id="project-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              Initialise modelwright in this folder
            </button>
            <button type="button" className="secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="recents">
        <h2>Recent projects</h2>
        {recents === null ? (
          <p className="muted">Loading…</p>
        ) : recents.length === 0 ? (
          <p className="muted">No recent projects. Paste a folder path above to open one.</p>
        ) : (
          <ul>
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  type="button"
                  className="recent-open"
                  onClick={() => void open(r.path)}
                  disabled={busy}
                >
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-path">{r.path}</span>
                  {!r.initialised && <span className="tag">not initialised</span>}
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Remove ${r.name} from recents`}
                  onClick={() => void remove(r.path)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
