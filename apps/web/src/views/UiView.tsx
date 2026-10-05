import { DEFAULT_DEVICES } from '@modelwright/schema';
import type { DocState } from '../useDesign';
import { ReloadGlyph } from '../ui';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

export function UiView({ state, onReload }: { state: DocState<'config'>; onReload: () => void }) {
  return (
    <div className="view-fill">
      <DocStateView kind="config" state={state} onReload={onReload}>
        {(config) => {
          if (!config.preview.url) {
            return (
              <EmptyCard
                title="No preview URL set"
                actions={
                  <button type="button" className="btn btn-secondary" onClick={onReload}>
                    <ReloadGlyph />
                    Reload
                  </button>
                }
              >
                Add preview.url to .design/config.json
                <pre className="snippet">
                  {'"preview": {\n  '}
                  <span className="snippet-key">"url"</span>
                  {': '}
                  <span className="snippet-value">"http://localhost:5173"</span>
                  {'\n}'}
                </pre>
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
