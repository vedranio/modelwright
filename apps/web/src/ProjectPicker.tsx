import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { version } from '../package.json';
import { ProjectClientError, useProjectClient, type ProjectSummary } from './platform';
import { relativeTime } from './relativeTime';
import { useShortcut } from './shortcuts';
import { Dot, Kbd, Logo } from './ui';

interface Props {
  onOpen: (project: ProjectSummary) => void;
  initialError?: string | null;
}

/**
 * The project picker, as a modal over the empty shell. It can't be dismissed: with no project
 * open there is nothing behind it to go back to.
 */
export function ProjectPicker({ onOpen, initialError = null }: Props) {
  const client = useProjectClient();
  const [recents, setRecents] = useState<ProjectSummary[] | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  /** A folder that was opened but has no `.design/` yet. */
  const [pending, setPending] = useState<ProjectSummary | null>(null);
  const [nameInput, setNameInput] = useState('');
  /** The recents row chosen with ↑/↓ (or the pointer); ↵ opens it. */
  const [highlight, setHighlight] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);

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
      pathRef.current?.focus();
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

  function cancelInitialise() {
    setPending(null);
    setError(null);
    pathRef.current?.focus();
  }

  async function remove(path: string) {
    setError(null);
    try {
      await client.removeRecent(path);
      setRecents((list) => list?.filter((r) => r.path !== path) ?? null);
      setHighlight(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function submitPath(event: FormEvent) {
    event.preventDefault();
    const path = pathInput.trim();
    if (path) void open(path);
  }

  const count = recents?.length ?? 0;

  function moveHighlight(delta: number) {
    if (count === 0) return;
    setHighlight((i) => (i === null ? (delta > 0 ? 0 : count - 1) : (i + delta + count) % count));
    listRef.current?.focus();
  }

  // ↑/↓ choose and ↵ opens, whenever focus isn't in a text field.
  const navigable = !pending && !busy && count > 0;
  useShortcut(
    (e) => e.key === 'ArrowDown' || e.key === 'ArrowUp',
    (e) => {
      e.preventDefault();
      moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
    },
    navigable,
  );
  useShortcut(
    (e) => e.key === 'Enter' && highlight !== null,
    (e) => {
      const row = highlight !== null ? recents?.[highlight] : undefined;
      if (!row) return;
      e.preventDefault();
      void open(row.path);
    },
    navigable,
  );

  /** ↓ from an empty path field moves into the list, so the keyboard can reach it. */
  function onPathKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && pathInput === '' && count > 0) {
      event.preventDefault();
      moveHighlight(1);
    }
  }

  return (
    <div className="scrim">
      <div className="picker" role="dialog" aria-modal="true" aria-label="Open a project">
        <section className="picker-main">
          <div className="wordmark">
            <Logo />
            <span>modelwright</span>
          </div>

          <div className="picker-body">
            <h1 className="picker-title">Open a project</h1>
            <p className="picker-copy">
              Paste the absolute path to a folder. modelwright keeps its files in .design/ inside
              it.
            </p>

            <form className="picker-open" onSubmit={submitPath}>
              <input
                ref={pathRef}
                className={`input input-lg${error && !pending ? ' input-error' : ''}`}
                type="text"
                aria-label="Project folder"
                aria-invalid={error && !pending ? true : undefined}
                placeholder="/absolute/path/to/project"
                value={pending ? pending.path : pathInput}
                onChange={(e) => {
                  setPathInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={onPathKeyDown}
                readOnly={pending !== null}
                spellCheck={false}
                autoComplete="off"
                autoFocus
              />
              {pending ? (
                <button type="submit" className="btn btn-lg btn-outline" disabled>
                  Open
                </button>
              ) : (
                <button type="submit" className="btn btn-lg btn-primary" disabled={busy}>
                  Open
                  <Kbd>↵</Kbd>
                </button>
              )}
            </form>

            {error && !pending && <FieldError message={error} />}

            {pending && (
              <form className="init-panel" onSubmit={initialise}>
                <h2 className="init-title">Initialise modelwright in this folder</h2>
                <p className="init-copy">
                  There's no .design/ folder here yet. modelwright will create one containing
                  config.json, erd.json and flows.json. Nothing else in the folder is touched.
                </p>
                <label className="field-label" htmlFor="project-name">
                  Project name
                </label>
                <input
                  id="project-name"
                  className="input input-lg"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelInitialise();
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                />
                {error && <FieldError message={error} />}
                <div className="init-actions">
                  <button type="button" className="btn btn-quiet" onClick={cancelInitialise}>
                    Cancel
                    <Kbd>esc</Kbd>
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Initialise
                    <Kbd>↵</Kbd>
                  </button>
                </div>
              </form>
            )}
          </div>

          <span className="picker-version">v{version}</span>
        </section>

        <section className="picker-recents" aria-label="Recent projects">
          <div className="recents-head">
            <h2 className="label">Recent projects</h2>
            {navigable && <span className="hint">↑↓ choose · ↵ open</span>}
          </div>

          {recents !== null && recents.length === 0 && (
            <div className="recents-empty">
              <p className="recents-empty-title">No recent projects</p>
              <p className="recents-empty-copy">Folders you open will be listed here.</p>
            </div>
          )}

          {recents !== null && recents.length > 0 && (
            <ul
              ref={listRef}
              className="recents"
              role="listbox"
              aria-label="Recent projects"
              aria-activedescendant={highlight !== null ? `recent-${highlight}` : undefined}
              tabIndex={0}
              onFocus={() => setHighlight((i) => i ?? 0)}
              onBlur={() => setHighlight(null)}
            >
              {recents.map((r, i) => (
                <li
                  key={r.path}
                  id={`recent-${i}`}
                  role="option"
                  aria-selected={highlight === i}
                  className={`recent${highlight === i ? ' highlighted' : ''}`}
                  title={r.path}
                  onClick={() => !busy && void open(r.path)}
                >
                  <span className="recent-text">
                    <span className="recent-name">
                      {r.name}
                      {!r.initialised && <span className="tag">not initialised</span>}
                    </span>
                    <span className="recent-path">{r.displayPath}</span>
                  </span>
                  <span className="recent-time">
                    {r.lastOpenedAt ? relativeTime(new Date(r.lastOpenedAt), new Date()) : ''}
                  </span>
                  <button
                    type="button"
                    className="btn-icon recent-remove"
                    aria-label={`Remove ${r.name} from recents`}
                    title="Remove from recents"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(r.path);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="field-error" role="alert">
      <Dot tone="error" />
      {message}
    </p>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof ProjectClientError && err.status === 404) return 'No folder at that path';
  return err instanceof Error ? err.message : String(err);
}
