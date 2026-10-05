import { useState } from 'react';
import { ProjectName } from './ProjectName';
import { useDesign } from './useDesign';
import { ErdView } from './views/ErdView';
import { FlowsView } from './views/FlowsView';
import { UiView } from './views/UiView';
import type { DesignKind, ProjectSummary } from './platform';
import { loadPref, savePref } from './storage';
import { Logo, ReloadGlyph } from './ui';

const VIEWS = [
  { id: 'erd', label: 'ERD', file: 'erd' },
  { id: 'flows', label: 'Flows', file: 'flows' },
  { id: 'ui', label: 'UI', file: 'config' },
] as const satisfies readonly { id: string; label: string; file: DesignKind }[];
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
  const [editingName, setEditingName] = useState(false);

  function selectView(id: ViewId) {
    setView(id);
    savePref(VIEW_KEY, id);
  }

  const onReload = () => void reload();

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="header-left">
          <Logo />
          <span className="crumb-sep" aria-hidden="true">
            /
          </span>
          <ProjectName
            projectPath={project.path}
            config={docs.config}
            fallbackName={project.name}
            onSaved={reload}
            onEditingChange={(editing) => {
              setEditingName(editing);
              setFocusReloadPaused(editing);
            }}
          />
          {editingName && <span className="hint">↵ save · esc cancel</span>}
          <span className={`project-path${editingName ? ' spaced' : ''}`} title={project.path}>
            {project.displayPath}
          </span>
        </div>

        <div className="segmented" role="tablist" aria-label="View">
          {VIEWS.map((v) => {
            const invalid = docs[v.file].status === 'invalid';
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                className={view === v.id ? 'selected' : undefined}
                onClick={() => selectView(v.id)}
                title={invalid ? `.design/${v.file}.json has problems` : undefined}
              >
                {v.label}
                {invalid && <span className="dot dot-warning" aria-label="has problems" />}
              </button>
            );
          })}
        </div>

        <div className="header-right">
          <button type="button" className="btn btn-quiet btn-tight" onClick={onReload}>
            <ReloadGlyph />
            Reload
          </button>
          <span className="divider" aria-hidden="true" />
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close project"
            title="Close project"
          >
            ×
          </button>
        </div>
      </header>

      <main className="view" role="tabpanel">
        {view === 'erd' && <ErdView state={docs.erd} onReload={onReload} />}
        {view === 'flows' && <FlowsView state={docs.flows} onReload={onReload} />}
        {view === 'ui' && <UiView state={docs.config} onReload={onReload} />}
      </main>
    </div>
  );
}
