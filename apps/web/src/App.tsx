import { useCallback, useEffect, useState } from 'react';
import { routeHostCommand, useHostCommand } from './hostCommands';
import { ProjectPicker, type PickerIntent } from './ProjectPicker';
import { Shell } from './Shell';
import { desktopHost, useProjectClient, type ProjectSummary } from './platform';
import { setTheme, useTheme } from './theme';
import { loadPref, savePref } from './storage';
import { Logo } from './ui';

const OPEN_PROJECT_KEY = 'openProject';

export function App() {
  const client = useProjectClient();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  // A project left open before a browser reload is reopened rather than dropping back to the picker.
  const [restoring, setRestoring] = useState(() => loadPref(OPEN_PROJECT_KEY) !== null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  /** A folder opened from the menu or the Dock that still needs initialising, for the picker. */
  const [pending, setPending] = useState<ProjectSummary | null>(null);
  const [theme] = useTheme();

  // The desktop app's menu, Dock and OS commands. None in the web build.
  const host = desktopHost();
  useEffect(() => host?.onCommand(routeHostCommand), [host]);
  // Reported once a remembered project has been reopened, so main's queued commands (a folder
  // dropped on the Dock at launch) arrive after it.
  useEffect(() => {
    if (!restoring) host?.setState({ projectOpen: project !== null, theme });
  }, [host, project, theme, restoring]);
  useHostCommand('theme', ({ theme: next }) => next && setTheme(next));
  // With no project open there's nothing to save before quitting.
  useHostCommand('close-for-quit', () => host?.readyToClose(), project === null);

  useEffect(() => {
    const saved = loadPref(OPEN_PROJECT_KEY);
    if (saved === null) return;
    client
      .openProject(saved)
      .then((summary) => {
        if (summary.initialised) setProject(summary);
        else savePref(OPEN_PROJECT_KEY, null);
      })
      .catch((err: unknown) => {
        savePref(OPEN_PROJECT_KEY, null);
        setRestoreError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setRestoring(false));
  }, [client]);

  const open = useCallback((summary: ProjectSummary) => {
    savePref(OPEN_PROJECT_KEY, summary.path);
    setRestoreError(null);
    setPending(null);
    setProject(summary);
  }, []);

  /** Closes the project (already saved), then does what comes next: open another, or the picker. */
  const close = useCallback(
    async (next?: PickerIntent) => {
      savePref(OPEN_PROJECT_KEY, null);
      setPending(null);
      if (next?.kind === 'open-path') {
        try {
          const summary = await client.openProject(next.path);
          if (summary.initialised) return open(summary);
          setPending(summary);
        } catch (err) {
          setRestoreError(err instanceof Error ? err.message : String(err));
        }
      }
      setProject(null);
    },
    [client, open],
  );

  if (restoring) return null;
  if (project) return <Shell key={project.path} project={project} onClose={close} />;
  return (
    <div className="shell">
      <header className="shell-header shell-header-empty">
        <Logo />
        <span className="app-name">modelwright</span>
      </header>
      <main className="view dot-grid" aria-hidden="true" />
      <ProjectPicker
        key={pending?.path ?? ''}
        onOpen={open}
        initialError={restoreError}
        initialPending={pending}
      />
    </div>
  );
}
