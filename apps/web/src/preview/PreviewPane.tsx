import { useState } from 'react';
import { loadPref, savePref } from '../storage';
import type { Config } from '@modelwright/schema';
import { DeviceFrame } from './DeviceFrame';
import { pickDevice, resolveDevices } from './devices';
import { PreviewToolbar } from './PreviewToolbar';
import { CheckingState, InvalidUrl, NothingRunning, RefusesEmbedding } from './PreviewStates';
import { usePreviewCheck } from './usePreviewCheck';

interface Props {
  projectPath: string;
  config: Config;
  /** A URL that already passed the rules in url.ts. */
  url: string;
  /** Whether the UI view is showing. */
  visible: boolean;
  onSetUrl: (url: string) => void;
}

/** The UI view with a valid URL: checks it, then shows the preview or says what's wrong. */
export function PreviewPane({ projectPath, config, url, visible, onSetUrl }: Props) {
  const { result, slow, recheck } = usePreviewCheck(url, visible);
  const devices = resolveDevices(config);
  // The chosen device is remembered per project, falling back to the first.
  const deviceKey = `preview-device:${projectPath}`;
  const [deviceId, setDeviceId] = useState(() => loadPref(deviceKey));
  const device = pickDevice(devices, deviceId);
  const chooseDevice = (id: string) => {
    setDeviceId(id);
    savePref(deviceKey, id);
  };
  const [reloads, setReloads] = useState(0);
  const [scale, setScale] = useState(1);

  if (!result) return slow ? <CheckingState url={url} /> : null;

  switch (result.status) {
    case 'unreachable':
      return (
        <NothingRunning
          url={url}
          detail={result.detail}
          devCommand={config.preview.devCommand}
          onSetUrl={onSetUrl}
        />
      );
    case 'refuses-embedding':
      return <RefusesEmbedding url={url} detail={result.detail} onSetUrl={onSetUrl} />;
    case 'invalid':
      return (
        <InvalidUrl
          url={url}
          problem={result.detail ?? 'This URL can’t be previewed.'}
          onSetUrl={onSetUrl}
        />
      );
    case 'ok':
      return (
        <div className="preview">
          <PreviewToolbar
            devices={devices}
            device={device}
            onDevice={chooseDevice}
            scale={scale}
            url={url}
            onSetUrl={onSetUrl}
            onReload={() => {
              setReloads((n) => n + 1);
              recheck();
            }}
          />
          <DeviceFrame
            device={device}
            url={url}
            frameKey={`${url}#${reloads}`}
            onScale={setScale}
          />
        </div>
      );
  }
}
