import { useEffect, useState } from 'react';
import { useConfirm } from './ConfirmDialog';
import { useEditableDoc } from './editing/useEditableDoc';
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
  const erd = useEditableDoc('erd', project.path, docs.erd);
  const [dialog, confirm] = useConfirm();

  // Re-reading on window focus never overwrites edits: it waits while the name is being
  // edited or the ERD has unsaved changes.
  useEffect(() => {
    setFocusReloadPaused(editingName || erd.dirty);
  }, [editingName, erd.dirty, setFocusReloadPaused]);

  function selectView(id: ViewId) {
    void erd.flush();
    setView(id);
    savePref(VIEW_KEY, id);
  }

  /** Re-reads the files from disk. Unsaved edits would be lost, so that asks first. */
  async function reloadFromDisk() {
    if (erd.dirty) {
      const discard = await confirm({
        title: 'Discard unsaved changes?',
        message:
          'Reload reads the design files from disk again. Your unsaved ERD changes will be lost.',
        confirmLabel: 'Discard and reload',
      });
      if (!discard) return;
      erd.discard();
    }
    await reload();
  }

  /** Saves before closing; if that fails, asks before throwing the edits away. */
  async function close() {
    if (!(await erd.flush())) {
      const closeAnyway = await confirm({
        title: 'Close without saving?',
        message: 'Your latest ERD changes couldn’t be saved and will be lost.',
        confirmLabel: 'Close anyway',
      });
      if (!closeAnyway) return;
    }
    onClose();
  }

  const onReload = () => void reloadFromDisk();

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
            onEditingChange={setEditingName}
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
            onClick={() => void close()}
            aria-label="Close project"
            title="Close project"
          >
            ×
          </button>
        </div>
      </header>

      <main className="view" role="tabpanel">
        {view === 'erd' && (
          <ErdView projectPath={project.path} state={docs.erd} edit={erd} onReload={onReload} />
        )}
        {view === 'flows' && <FlowsView state={docs.flows} onReload={onReload} />}
        {view === 'ui' && <UiView state={docs.config} onReload={onReload} />}
      </main>
      {dialog}
    </div>
  );
}
