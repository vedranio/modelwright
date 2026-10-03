import { useState } from 'react';
import { ProjectName } from './ProjectName';
import { useDesign } from './useDesign';
import { ErdView } from './views/ErdView';
import { FlowsView } from './views/FlowsView';
import { UiView } from './views/UiView';
import type { ProjectSummary } from './platform';
import { loadPref, savePref } from './storage';

const VIEWS = [
  { id: 'erd', label: 'ERD' },
  { id: 'flows', label: 'Flows' },
  { id: 'ui', label: 'UI' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

const VIEW_KEY = 'view';

function initialView(): ViewId {
  const saved = loadPref(VIEW_KEY);
  return VIEWS.find((v) => v.id === saved)?.id ?? 'erd';
}

interface Props {
  project: ProjectSummary;
  onClose: () => void;
}

export function Shell({ project, onClose }: Props) {
  const { docs, reload, setFocusReloadPaused } = useDesign(project.path);
  const [view, setView] = useState<ViewId>(initialView);

  function selectView(id: ViewId) {
    setView(id);
    savePref(VIEW_KEY, id);
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="project">
          <ProjectName
            projectPath={project.path}
            config={docs.config}
            fallbackName={project.name}
            onSaved={reload}
            onEditingChange={setFocusReloadPaused}
          />
          <span className="project-path" title={project.path}>
            {project.path}
          </span>
        </div>

        <div className="segmented" role="tablist" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={view === v.id ? 'selected' : undefined}
              onClick={() => selectView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={() => void reload()}>
            Reload
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Close project
          </button>
        </div>
      </header>

      <main className="view" role="tabpanel">
        {view === 'erd' && <ErdView state={docs.erd} />}
        {view === 'flows' && <FlowsView state={docs.flows} />}
        {view === 'ui' && <UiView state={docs.config} />}
      </main>
    </div>
  );
}
