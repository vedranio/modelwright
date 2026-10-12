import { useEffect, useState, type ReactNode } from 'react';
import { loadPref, savePref } from '../storage';
import type { Config } from '@modelwright/schema';
import { DeviceFrame } from './DeviceFrame';
import { pickDevice, resolveDevices } from './devices';
import { PreviewToolbar } from './PreviewToolbar';
import { CheckingState, InvalidUrl, NothingRunning, RefusesEmbedding } from './PreviewStates';
import { usePreviewCheck } from './usePreviewCheck';
import { useShortcut } from '../shortcuts';

interface Props {
  projectPath: string;
  config: Config;
  /** A URL that already passed the rules in url.ts. */
  url: string;
  /** Whether the UI view is showing. */
  visible: boolean;
  onSetUrl: (url: string) => void;
  /** Starting the dev server, for the "Nothing running" card. */
  devServer?: ReactNode;
  /** Told whether the preview is showing the app. */
  onLive?: (live: boolean) => void;
  /** Changes when the dev server starts or stops: the preview checks again at once. */
  serverKey?: string;
}

/** The UI view with a valid URL: checks it, then shows the preview or says what's wrong. */
export function PreviewPane({
  projectPath,
  config,
  url,
  visible,
  onSetUrl,
  devServer,
  onLive,
  serverKey,
}: Props) {
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
  const reloadPreview = () => {
    setReloads((n) => n + 1);
    recheck();
  };
  // View ▸ Reload Preview in the desktop app; otherwise the check retries by itself.
  useShortcut(
    'reload-preview',
    (e) => {
      e.preventDefault();
      if (result?.status === 'ok') reloadPreview();
      else recheck();
    },
    visible,
  );

  // A preview that's up isn't re-checked in the background, so a server stopped from here
  // would leave a dead page on screen. Starting or stopping it checks again straight away.
  useEffect(() => {
    if (serverKey !== undefined) recheck();
  }, [serverKey, recheck]);

  const live = result?.status === 'ok';
  useEffect(() => {
    onLive?.(live);
  }, [onLive, live]);
  useEffect(() => () => onLive?.(false), [onLive]);

  if (!result) return slow ? <CheckingState url={url} /> : null;

  switch (result.status) {
    case 'unreachable':
      return (
        <NothingRunning
          url={url}
          detail={result.detail}
          {...(devServer !== undefined && { devServer })}
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
            onReload={reloadPreview}
          />
          <DeviceFrame
            device={device}
            url={url}
            frameKey={`${url}#${reloads}`}
            reload={reloads}
            visible={visible}
            onScale={setScale}
          />
        </div>
      );
  }
}
