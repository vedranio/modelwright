import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DESIGN_KINDS } from '@modelwright/schema';
import { BuildIndicator } from './buildRecord/BuildIndicator';
import { buildStatus } from './buildRecord/status';
import { useBuildRecord } from './buildRecord/useBuildRecord';
import { useConfirm } from './ConfirmDialog';
import { useEditableDoc } from './editing/useEditableDoc';
import { ProjectName } from './ProjectName';
import { useDesign } from './useDesign';
import { ErdView } from './views/ErdView';
import { FlowsView } from './views/FlowsView';
import { UiView } from './views/UiView';
import { useProjectClient, type DesignKind, type ProjectSummary } from './platform';
import { loadPref, savePref } from './storage';
import { Icon } from './Icon';
import { ShortcutsOverlay } from './ShortcutsOverlay';
import { ThemeMenu } from './ThemeMenu';
import { useShortcut } from './shortcuts';
import { shortcutHint } from './shortcutRegistry';
import { ToastProvider, useToasts } from './Toast';
import { Dot, Logo, ReloadGlyph } from './ui';

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
  const client = useProjectClient();
  const { docs, reload, reloadOne, setFocusReloadPaused, noteWritten } = useDesign(project.path);
  const [view, setView] = useState<ViewId>(initialView);
  // The UI view stays mounted (hidden) once visited, so its preview doesn't reload on return.
  const [uiVisited, setUiVisited] = useState(() => view === 'ui');
  const [editingName, setEditingName] = useState(false);
  const erd = useEditableDoc('erd', project.path, docs.erd, noteWritten);
  const flows = useEditableDoc('flows', project.path, docs.flows, noteWritten);
  const config = useEditableDoc('config', project.path, docs.config, noteWritten);
  const [dialog, confirm] = useConfirm();

  // A design file changed on disk. With no unsaved edits it's simply re-read (which also clears
  // that document's undo history); with unsaved edits, saving waits for a choice on the banner.
  const editors = { erd, flows, config };
  const latestEditors = useRef(editors);
  useLayoutEffect(() => {
    latestEditors.current = editors;
  });
  // The last build, as `.design/build.json` records it.
  const build = useBuildRecord(project.path);
  const loadBuild = build.reload;

  useEffect(
    () =>
      client.watchDesign(project.path, ({ kind }) => {
        if (kind === 'build') {
          void loadBuild();
          return;
        }
        const editor = latestEditors.current[kind];
        if (editor.dirty) editor.hold();
        else void reloadOne(kind);
      }),
    [client, project.path, reloadOne, loadBuild],
  );

  // "Built 3 minutes ago" moves on by itself.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // Compared against the working copies, so unsaved edits count too.
  const designLoading = DESIGN_KINDS.some((kind) => docs[kind].status === 'loading');
  const status = useMemo(
    () =>
      buildStatus(
        build.read,
        erd.doc && flows.doc && config.doc
          ? { erd: erd.doc, flows: flows.doc, config: config.doc }
          : null,
        designLoading,
        now,
      ),
    [build.read, erd.doc, flows.doc, config.doc, designLoading, now],
  );
  const [toastRegion, toasts] = useToasts();
  const [showShortcuts, setShowShortcuts] = useState(false);

  // A toast about an edit goes once its document is edited again (its Undo would undo
  // something else), and on any view switch.
  const shownToast = toasts.current;
  const revisions: Record<string, number> = { erd: erd.revision, flows: flows.revision };
  const staleToast =
    shownToast?.owner !== undefined &&
    revisions[shownToast.owner.doc] !== shownToast.owner.revision;
  useEffect(() => {
    if (staleToast) toasts.dismiss();
  }, [staleToast, toasts]);

  // Re-reading on window focus never overwrites edits: it waits while the name is being
  // edited or any file has unsaved changes.
  useEffect(() => {
    setFocusReloadPaused(editingName || erd.dirty || flows.dirty || config.dirty);
  }, [editingName, erd.dirty, flows.dirty, config.dirty, setFocusReloadPaused]);

  function selectView(id: ViewId) {
    // Save the view being left, so its edits are on disk before the other one shows.
    if (view === 'erd') void erd.flush();
    if (view === 'flows') void flows.flush();
    setView(id);
    toasts.dismiss();
    if (id === 'ui') setUiVisited(true);
    savePref(VIEW_KEY, id);
  }

  /** Re-reads the files from disk. Unsaved edits would be lost, so that asks first. */
  async function reloadFromDisk() {
    const unsaved = listed([erd.dirty && 'ERD', flows.dirty && 'Flows', config.dirty && 'UI']);
    if (unsaved) {
      const discard = await confirm({
        title: 'Discard unsaved changes?',
        message: `Reload reads the design files from disk again. Your unsaved ${unsaved} changes will be lost.`,
        confirmLabel: 'Discard and reload',
      });
      if (!discard) return;
      erd.discard();
      flows.discard();
      config.discard();
    }
    void loadBuild();
    await reload();
  }

  /** Saves before closing; if that fails, asks before throwing the edits away. */
  async function close() {
    const [erdSaved, flowsSaved, configSaved] = await Promise.all([
      erd.flush(),
      flows.flush(),
      config.flush(),
    ]);
    if (!erdSaved || !flowsSaved || !configSaved) {
      const failed = listed([!erdSaved && 'ERD', !flowsSaved && 'Flows', !configSaved && 'UI']);
      const closeAnyway = await confirm({
        title: 'Close without saving?',
        message: `Your latest ${failed} changes couldn’t be saved and will be lost.`,
        confirmLabel: 'Close anyway',
      });
      if (!closeAnyway) return;
    }
    onClose();
  }

  const onReload = () => void reloadFromDisk();
  const viewFile = VIEWS.find((v) => v.id === view)?.file ?? 'erd';
  const viewEditor = editors[viewFile];

  const viewKey = (id: ViewId) => (e: KeyboardEvent) => {
    e.preventDefault();
    if (id !== view) selectView(id);
  };
  useShortcut('view-erd', viewKey('erd'));
  useShortcut('view-flows', viewKey('flows'));
  useShortcut('view-ui', viewKey('ui'));
  useShortcut('shortcuts', (e) => {
    e.preventDefault();
    setShowShortcuts(true);
  });

  return (
    <ToastProvider value={toasts}>
      <div className="shell">
        <header className="shell-header">
          <div className="header-left">
            <Logo />
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
            <ProjectName
              config={config}
              fallbackName={project.name}
              onEditingChange={setEditingName}
            />
            {editingName && <span className="hint">↵ save · esc cancel</span>}
            <span className={`project-path${editingName ? ' spaced' : ''}`} title={project.path}>
              {project.displayPath}
            </span>
            <BuildIndicator status={status} />
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
            <ThemeMenu />
            <button
              type="button"
              className="btn-icon"
              onClick={() => setShowShortcuts(true)}
              aria-label="Keyboard shortcuts"
              title={`Keyboard shortcuts (${shortcutHint('shortcuts')})`}
            >
              <Icon name="question_mark" />
            </button>
            <span className="divider" aria-hidden="true" />
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
              <Icon name="close" />
            </button>
          </div>
        </header>

        <main className="view" role="tabpanel">
          {view === 'erd' && (
            <ErdView projectPath={project.path} state={docs.erd} edit={erd} onReload={onReload} />
          )}
          {view === 'flows' && (
            <FlowsView
              projectPath={project.path}
              state={docs.flows}
              edit={flows}
              onReload={onReload}
            />
          )}
          {(view === 'ui' || uiVisited) && (
            <UiView
              projectPath={project.path}
              state={docs.config}
              edit={config}
              visible={view === 'ui'}
              onReload={onReload}
            />
          )}
          {viewEditor.held && (
            <ConflictBanner
              file={viewFile}
              onLoad={() => {
                viewEditor.discard();
                void reloadOne(viewFile);
              }}
              onKeep={viewEditor.keepMine}
            />
          )}
          {toastRegion}
        </main>
        {dialog}
        {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      </div>
    </ToastProvider>
  );
}

/** "ERD", "ERD and Flows", "ERD, Flows and UI". */
function listed(names: (string | false)[]): string {
  const present = names.filter((n): n is string => Boolean(n));
  if (present.length <= 1) return present.join('');
  return `${present.slice(0, -1).join(', ')} and ${present[present.length - 1]}`;
}

/** Shown on a view whose file changed on disk while it had unsaved edits. */
function ConflictBanner({
  file,
  onLoad,
  onKeep,
}: {
  file: DesignKind;
  onLoad: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="conflict-banner" role="alert">
      <Dot tone="warning" />
      <span className="conflict-message">{file}.json was changed outside modelwright.</span>
      <button type="button" className="btn btn-quiet btn-tight" onClick={onLoad}>
        Load from disk
      </button>
      <button type="button" className="btn btn-primary btn-tight" onClick={onKeep}>
        Keep mine
      </button>
    </div>
  );
}
