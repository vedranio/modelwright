import { setPreviewUrl } from '../config/ops';
import type { EditableDoc } from '../editing/useEditableDoc';
import { PreviewPane } from '../preview/PreviewPane';
import { InvalidUrl } from '../preview/PreviewStates';
import { checkPreviewUrl } from '../preview/url';
import { UrlField, toolRules } from '../preview/UrlField';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

interface Props {
  /** config.json as read, for its loading and validation states. */
  state: DocState<'config'>;
  /** The shared config editor; its working copy is what the view shows. */
  edit: EditableDoc<'config'>;
  /** Whether the UI view is the one showing. */
  visible: boolean;
  onReload: () => void;
}

export function UiView({ state, edit, visible, onReload }: Props) {
  const setUrl = (url: string) => edit.apply((c) => setPreviewUrl(c, url), { saveNow: true });

  return (
    <div className="view-fill ui-view">
      <DocStateView kind="config" state={state} onReload={onReload}>
        {(onDisk) => {
          const config = edit.doc ?? onDisk;
          if (!config.preview.url) {
            return (
              <EmptyCard title="No preview URL set">
                Where your project’s dev server runs. It’s saved to .design/config.json.
                <UrlField className="empty-url" submitLabel="Set preview URL" onCommit={setUrl} />
              </EmptyCard>
            );
          }
          const url = config.preview.url;
          const stored = checkPreviewUrl(url, toolRules());
          if (!stored.ok) {
            return <InvalidUrl url={url} problem={stored.problem} onSetUrl={setUrl} />;
          }
          return <PreviewPane config={config} url={url} visible={visible} onSetUrl={setUrl} />;
        }}
      </DocStateView>
    </div>
  );
}
