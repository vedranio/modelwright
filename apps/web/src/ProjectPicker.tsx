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
import { useKeydown } from './shortcuts';
import { loadPref, savePref } from './storage';
import { Icon } from './Icon';
import { FieldError, Kbd, Logo } from './ui';

/** How many recent projects the picker lists. */
const RECENT_LIMIT = 5;
/** Where new projects go until another location is used. */
const DEFAULT_LOCATION = '~/Code';
const LOCATION_PREF = 'new-project-location';

interface Props {
  onOpen: (project: ProjectSummary) => void;
  initialError?: string | null;
}

/**
 * The project picker, as a modal over the empty shell. It can't be dismissed: with no project
 * open there is nothing behind it to go back to. Creating a project comes first, on the left.
 * The right side lists the five most recent projects, and below them opens an existing folder
 * by its path (a native folder dialog waits for Electron).
 */
export function ProjectPicker({ onOpen, initialError = null }: Props) {
  const client = useProjectClient();
  const [recents, setRecents] = useState<ProjectSummary[] | null>(null);
  const [pathInput, setPathInput] = useState('');
  /** Problems opening (or initialising) an existing folder. */
  const [error, setError] = useState<string | null>(initialError);
  /** Whether "Open an existing project" has been expanded into its path field. */
  const [openExpanded, setOpenExpanded] = useState(initialError !== null);
  const [newName, setNewName] = useState('');
  const [location, setLocation] = useState(() => loadPref(LOCATION_PREF) ?? DEFAULT_LOCATION);
  const [git, setGit] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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

  async function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    const parent = location.trim();
    if (!name) return setCreateError('Give the project a name');
    if (!parent) return setCreateError('Choose where the project goes');
    setBusy(true);
    setCreateError(null);
    try {
      const summary = await client.createProject(parent, name, git);
      savePref(LOCATION_PREF, parent === DEFAULT_LOCATION ? null : parent);
      onOpen(summary);
    } catch (err) {
      setCreateError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function open(path: string) {
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const summary = await client.openProject(path);
      if (summary.initialised) {
        onOpen(summary);
      } else {
        setOpenExpanded(true);
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

  const shown = recents?.slice(0, RECENT_LIMIT) ?? null;
  // Until there's a project of the user's own, the list holds just the demo.
  const onlyDemo = shown !== null && shown.length > 0 && shown.every((r) => r.demo);
  const listTitle = onlyDemo ? 'Demo project' : 'Recent projects';
  const count = shown?.length ?? 0;

  function moveHighlight(delta: number) {
    if (count === 0) return;
    setHighlight((i) => (i === null ? (delta > 0 ? 0 : count - 1) : (i + delta + count) % count));
    listRef.current?.focus();
  }

  // ↑/↓ choose and ↵ opens, whenever focus isn't in a text field.
  const navigable = !pending && !busy && count > 0;
  useKeydown(
    (e) => e.key === 'ArrowDown' || e.key === 'ArrowUp',
    (e) => {
      e.preventDefault();
      moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
    },
    navigable,
  );
  useKeydown(
    (e) => e.key === 'Enter' && highlight !== null,
    (e) => {
      const row = highlight !== null ? shown?.[highlight] : undefined;
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

  const target = newName.trim() ? `${location.trim().replace(/\/+$/, '')}/${newName.trim()}` : null;

  return (
    <div className="scrim">
      <div className="picker" role="dialog" aria-modal="true" aria-label="Create or open a project">
        <section className="picker-main">
          <div className="wordmark">
            <Logo />
            <span>modelwright</span>
          </div>

          <div className="picker-body">
            <h1 className="picker-title">Create a project</h1>
            <p className="picker-copy">
              modelwright makes a new folder for your project, with a .design/ folder inside it for
              the design. Your AI coding tool builds the app in the same folder.
            </p>

            <form className="picker-create" onSubmit={(e) => void create(e)}>
              <label className="field-label" htmlFor="new-project-name">
                Name
              </label>
              <input
                id="new-project-name"
                className={`input input-lg${createError ? ' input-error' : ''}`}
                type="text"
                placeholder="My app"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setCreateError(null);
                }}
                spellCheck={false}
                autoComplete="off"
                autoFocus={!openExpanded}
              />
              <label className="field-label" htmlFor="new-project-location">
                Location
              </label>
              <input
                id="new-project-location"
                className="input input-lg"
                type="text"
                placeholder={DEFAULT_LOCATION}
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setCreateError(null);
                }}
                spellCheck={false}
                autoComplete="off"
              />
              <p className="picker-target">
                {target ? (
                  <>
                    Creates <code>{target}</code>
                  </>
                ) : (
                  'The project gets its own folder in this location.'
                )}
              </p>
              <label className="checkbox">
                <input type="checkbox" checked={git} onChange={(e) => setGit(e.target.checked)} />
                Initialise a git repository
              </label>
              {createError && <FieldError message={createError} />}
              <div className="picker-create-actions">
                <button type="submit" className="btn btn-lg btn-primary" disabled={busy}>
                  Create project
                  <ReturnKey />
                </button>
              </div>
            </form>
          </div>

          <span className="picker-version">v{version}</span>
        </section>

        <section className="picker-side">
          <div className="picker-recents" aria-label={listTitle}>
            <div className="recents-head">
              <h2 className="label">{listTitle}</h2>
              {navigable && (
                <span className="hint picker-keys">
                  <Icon name="sync_alt" upright /> choose · <Icon name="keyboard_return" /> open
                </span>
              )}
            </div>

            {shown !== null && shown.length === 0 && (
              <div className="recents-empty">
                <p className="recents-empty-title">No recent projects</p>
                <p className="recents-empty-copy">
                  Projects you create or open will be listed here.
                </p>
              </div>
            )}

            {shown !== null && shown.length > 0 && (
              <ul
                ref={listRef}
                className="recents"
                role="listbox"
                aria-label={listTitle}
                aria-activedescendant={highlight !== null ? `recent-${highlight}` : undefined}
                tabIndex={0}
                onFocus={() => setHighlight((i) => i ?? 0)}
                onBlur={() => setHighlight(null)}
              >
                {shown.map((r, i) => (
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
                        {r.demo && <span className="tag">demo</span>}
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
          </div>

          <div className="picker-open-section">
            {!openExpanded ? (
              <button
                type="button"
                className="btn btn-lg btn-outline picker-open-toggle"
                onClick={() => {
                  setOpenExpanded(true);
                  requestAnimationFrame(() => pathRef.current?.focus());
                }}
              >
                Open an existing project
              </button>
            ) : (
              <>
                <h2 className="label">Open an existing project</h2>
                <p className="picker-copy">
                  Paste the absolute path to its folder. modelwright keeps its files in .design/
                  inside it.
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
                    onKeyDown={(e) => {
                      onPathKeyDown(e);
                      if (e.key === 'Escape' && !pending) {
                        setOpenExpanded(false);
                        setError(null);
                      }
                    }}
                    readOnly={pending !== null}
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus={openExpanded}
                  />
                  {pending ? (
                    <button type="submit" className="btn btn-lg btn-outline" disabled>
                      Open
                    </button>
                  ) : (
                    <button type="submit" className="btn btn-lg btn-primary" disabled={busy}>
                      Open
                      <ReturnKey />
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
                        <ReturnKey />
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** The ↵ hint on the picker's buttons, drawn with Material's keyboard_return icon. */
function ReturnKey() {
  return (
    <Kbd>
      <Icon name="keyboard_return" />
    </Kbd>
  );
}

function messageOf(err: unknown): string {
  if (err instanceof ProjectClientError && err.status === 404) return 'No folder at that path';
  return err instanceof Error ? err.message : String(err);
}
