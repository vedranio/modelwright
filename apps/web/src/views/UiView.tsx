import { useState } from 'react';
import { checkPreviewUrl, setDevCommand, setPreviewUrl } from '@modelwright/project/rules';
import type { EditableDoc } from '../editing/useEditableDoc';
import { DevServerLog, DevServerStart } from '../preview/DevServerControls';
import { PreviewPane } from '../preview/PreviewPane';
import { useDevServer } from '../preview/useDevServer';
import { InvalidUrl } from '../preview/PreviewStates';
import { UrlField, toolRules } from '../preview/UrlField';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

interface Props {
  projectPath: string;
  /** config.json as read, for its loading and validation states. */
  state: DocState<'config'>;
  /** The shared config editor; its working copy is what the view shows. */
  edit: EditableDoc<'config'>;
  /** Whether the UI view is the one showing. Once visited it stays mounted, hidden. */
  visible: boolean;
  onReload: () => void;
}

export function UiView({ projectPath, state, edit, visible, onReload }: Props) {
  const setUrl = (url: string) => edit.apply((c) => setPreviewUrl(c, url), { saveNow: true });
  const setCommand = (command: string) =>
    edit.apply((c) => setDevCommand(c, command), { saveNow: true });
  const server = useDevServer(projectPath);
  /** Whether the preview is showing the app (not a "Nothing running" card). */
  const [live, setLive] = useState(false);

  // The log opens while a server starts and after a crash, and folds away once the preview is
  // up. A toggle by hand holds until that changes.
  const { status, startedAt, exitCode, error } = server.state;
  const crashed = status === 'exited' && (Boolean(error) || (exitCode ?? 0) !== 0);
  const situation = `${startedAt}:${status}:${live}`;
  const [toggled, setToggled] = useState<{ situation: string; open: boolean } | null>(null);
  const logOpen =
    toggled?.situation === situation ? toggled.open : (status === 'running' && !live) || crashed;

  return (
    <div className="view-fill ui-view" hidden={!visible}>
      <div className="ui-main">
        <DocStateView kind="config" state={state} onReload={onReload}>
          {(onDisk) => {
            const config = edit.doc ?? onDisk;
            const devCommand = config.preview.devCommand;
            const start = (
              <DevServerStart
                server={server}
                {...(devCommand !== undefined && { devCommand })}
                onSetDevCommand={setCommand}
              />
            );
            if (!config.preview.url) {
              return (
                <EmptyCard title="No preview URL set">
                  Where your project’s dev server runs. It’s saved to .design/config.json.
                  <UrlField className="empty-url" submitLabel="Set preview URL" onCommit={setUrl} />
                  {devCommand && start}
                </EmptyCard>
              );
            }
            const url = config.preview.url;
            const stored = checkPreviewUrl(url, toolRules());
            if (!stored.ok) {
              return <InvalidUrl url={url} problem={stored.problem} onSetUrl={setUrl} />;
            }
            return (
              <PreviewPane
                projectPath={projectPath}
                config={config}
                url={url}
                visible={visible}
                onSetUrl={setUrl}
                devServer={start}
                onLive={setLive}
                serverKey={`${startedAt}:${status}`}
              />
            );
          }}
        </DocStateView>
      </div>
      {status !== 'idle' && (
        <DevServerLog
          server={server}
          open={logOpen}
          onToggle={() => setToggled({ situation, open: !logOpen })}
          {...(edit.doc?.preview.url !== undefined && { previewUrl: edit.doc.preview.url })}
          onUseUrl={setUrl}
        />
      )}
      {server.dialog}
    </div>
  );
}
