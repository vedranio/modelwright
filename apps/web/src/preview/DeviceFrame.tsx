import { useLayoutEffect, useRef, useState } from 'react';
import type { Device } from '@modelwright/schema';
import { tokenNumber } from '../canvas/tokens';
import { isNarrow } from './devices';
import { fitScale, type Area, type Chrome } from './scale';

/** Real apps need scripts, storage, forms, popups, dialogs and downloads. See preview/url.ts. */
const SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads';

interface Props {
  device: Device;
  url: string;
  /** Changing this remounts the iframe (Reload preview). Changing the device never does. */
  frameKey: string;
  /** Told the frame's scale whenever it changes, for the toolbar. */
  onScale: (scale: number) => void;
}

/**
 * The iframe in a device frame, centred in the space left below the toolbar and scaled down
 * (never up) to fit whole. A narrow device gets a phone-like bezel, a wide one a window bar.
 * Both share one element tree, so switching device only resizes the iframe.
 */
export function DeviceFrame({ device, url, frameKey, onScale }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Area>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Hidden (another view is showing): keep the last size, so the app isn't resized to nothing.
      if (width === 0 && height === 0) return;
      setArea((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const narrow = isNarrow(device);
  const chrome = chromeOf(narrow);
  const fit = fitScale(device, area, chrome);

  useLayoutEffect(() => {
    onScale(fit.scale);
  }, [onScale, fit.scale]);

  const outerWidth = (fit.viewportWidth + chrome.x) * fit.scale;
  const outerHeight = (fit.viewportHeight + chrome.y) * fit.scale;

  return (
    <div className="preview-stage" ref={stage}>
      <div className="device-slot" style={{ width: outerWidth, height: outerHeight }}>
        <div
          className={`device-frame ${narrow ? 'device-phone' : 'device-window'}`}
          style={{ transform: fit.scale === 1 ? undefined : `scale(${fit.scale})` }}
        >
          <div className="device-bar" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="device-screen">
            <iframe
              key={frameKey}
              className="device-iframe"
              src={url}
              title={`Preview of ${url}`}
              sandbox={SANDBOX}
              style={{ width: fit.viewportWidth, height: fit.viewportHeight }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The frame's size around the viewport, from the same tokens the CSS draws it with. */
function chromeOf(narrow: boolean): Chrome {
  const border = tokenNumber('--border-w');
  if (narrow) {
    const side = 2 * (tokenNumber('--device-bezel') + border);
    return { x: side, y: side };
  }
  return { x: 2 * border, y: tokenNumber('--window-bar-h') + 2 * border };
}
