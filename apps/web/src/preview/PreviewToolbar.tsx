import type { Device } from '@modelwright/schema';
import { ReloadGlyph } from '../ui';
import { sizeLabel } from './devices';
import { scaleLabel } from './scale';
import { EditableUrl } from './UrlField';
import { Icon } from '../Icon';

/** More devices than this and the toggle becomes a select. */
const MAX_SEGMENTS = 4;

interface Props {
  devices: readonly Device[];
  device: Device;
  onDevice: (id: string) => void;
  /** The frame's current scale; shown only when it's below 1. */
  scale: number;
  url: string;
  onSetUrl: (url: string) => void;
  onReload: () => void;
}

export function PreviewToolbar({
  devices,
  device,
  onDevice,
  scale,
  url,
  onSetUrl,
  onReload,
}: Props) {
  return (
    <div className="preview-toolbar">
      <div className="preview-toolbar-left">
        {devices.length > MAX_SEGMENTS ? (
          <select
            className="input device-select"
            aria-label="Device"
            value={device.id}
            onChange={(e) => onDevice(e.target.value)}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          devices.length > 1 && (
            <div className="segmented" role="tablist" aria-label="Device">
              {devices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={d.id === device.id}
                  className={d.id === device.id ? 'selected' : undefined}
                  onClick={() => onDevice(d.id)}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )
        )}
        <span className="preview-size">
          {devices.length === 1 && <span className="preview-device-name">{device.name}</span>}
          {sizeLabel(device)}
        </span>
        {scale < 1 && (
          <span className="scale-chip" title="Scaled down to fit">
            {scaleLabel(scale)}
          </span>
        )}
      </div>
      <div className="preview-toolbar-right">
        <EditableUrl className="toolbar-url" url={url} onCommit={onSetUrl} />
        <button type="button" className="btn btn-quiet btn-tight" onClick={onReload}>
          <ReloadGlyph />
          Reload preview
        </button>
        <a className="btn btn-quiet btn-tight" href={url} target="_blank" rel="noopener noreferrer">
          <Icon name="open_in_browser" />
          Open in browser
        </a>
      </div>
    </div>
  );
}
