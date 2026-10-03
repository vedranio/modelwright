import { useCallback, useEffect, useState } from 'react';
import { ProjectPicker } from './ProjectPicker';
import { Shell } from './Shell';
import { useProjectClient, type ProjectSummary } from './platform';
import { loadPref, savePref } from './storage';

const OPEN_PROJECT_KEY = 'openProject';

export function App() {
  const client = useProjectClient();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  // A project left open before a browser reload is reopened rather than dropping back to the picker.
  const [restoring, setRestoring] = useState(() => loadPref(OPEN_PROJECT_KEY) !== null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

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
    setProject(summary);
  }, []);

  const close = useCallback(() => {
    savePref(OPEN_PROJECT_KEY, null);
    setProject(null);
  }, []);

  if (restoring) return null;
  if (project) return <Shell key={project.path} project={project} onClose={close} />;
  return <ProjectPicker onOpen={open} initialError={restoreError} />;
}
