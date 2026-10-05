import { DEFAULT_DEVICES } from '@modelwright/schema';
import { setPreviewUrl } from '../config/ops';
import type { EditableDoc } from '../editing/useEditableDoc';
import { UrlField } from '../preview/UrlField';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

interface Props {
  /** config.json as read, for its loading and validation states. */
  state: DocState<'config'>;
  /** The shared config editor; its working copy is what the view shows. */
  edit: EditableDoc<'config'>;
  onReload: () => void;
}

export function UiView({ state, edit, onReload }: Props) {
  const setUrl = (url: string) => edit.apply((c) => setPreviewUrl(c, url), { saveNow: true });

  return (
    <div className="view-fill">
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
          const devices = config.devices ?? DEFAULT_DEVICES;
          return (
            <section className="doc-list">
              <h2 className="label">Preview URL</h2>
              <p>
                <code>{config.preview.url}</code>
              </p>
              <h2 className="label">
                Devices
                {!config.devices && <span className="tag">built-in presets</span>}
              </h2>
              <ul className="items">
                {devices.map((d) => (
                  <li key={d.id}>
                    <strong>{d.name}</strong>{' '}
                    <span className="muted">
                      {d.width}
                      {d.height !== undefined ? ` × ${d.height}` : ''} px
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        }}
      </DocStateView>
    </div>
  );
}
