import { DEFAULT_DEVICES } from '@modelwright/schema';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { Empty } from './common';

export function UiView({ state }: { state: DocState<'config'> }) {
  return (
    <DocStateView kind="config" state={state}>
      {(config) => {
        const devices = config.devices ?? DEFAULT_DEVICES;
        return (
          <section>
            <h2>Preview URL</h2>
            {config.preview.url ? (
              <p>
                <code>{config.preview.url}</code>
              </p>
            ) : (
              <Empty>
                No preview URL set. Add <code>preview.url</code> to <code>.design/config.json</code>{' '}
                — the live preview arrives in phase 4.
              </Empty>
            )}

            <h2>
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
  );
}
