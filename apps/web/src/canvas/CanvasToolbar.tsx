import { Fragment, type ReactNode } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useShortcut } from '../shortcuts';
import { shortcutHint } from '../shortcutRegistry';
import { Kbd } from '../ui';
import { tokenNumber } from './tokens';

/**
 * The floating toolbar centred at the bottom of the canvas, as in 04-shell-erd: the view's own
 * actions, then zoom out, the zoom percentage, zoom in and Fit.
 */
export function CanvasToolbar({ actions }: { actions?: ReactNode }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const duration = () => tokenNumber('--duration-fast');
  const fit = () => void flow.fitView({ ...FIT_OPTIONS, duration: duration() });
  const zoomIn = () => void flow.zoomIn({ duration: duration() });
  const zoomOut = () => void flow.zoomOut({ duration: duration() });

  const key = (action: () => void) => (e: KeyboardEvent) => {
    e.preventDefault();
    action();
  };
  useShortcut('fit', key(fit));
  useShortcut('zoom-in', key(zoomIn));
  useShortcut('zoom-out', key(zoomOut));
  useShortcut(
    'zoom-reset',
    key(() => void flow.zoomTo(1, { duration: duration() })),
  );

  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas">
      {actions && (
        <Fragment>
          {actions}
          <span className="divider" aria-hidden="true" />
        </Fragment>
      )}
      <button
        type="button"
        className="btn-icon btn-glyph"
        aria-label="Zoom out"
        title={`Zoom out (${shortcutHint('zoom-out')})`}
        onClick={zoomOut}
      >
        −
      </button>
      <span className="zoom-readout" aria-label="Zoom level">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        className="btn-icon btn-glyph"
        aria-label="Zoom in"
        title={`Zoom in (${shortcutHint('zoom-in')})`}
        onClick={zoomIn}
      >
        +
      </button>
      <span className="divider" aria-hidden="true" />
      <button type="button" className="btn btn-quiet btn-tight" onClick={fit}>
        Fit
        <Kbd>{shortcutHint('fit')}</Kbd>
      </button>
    </div>
  );
}

/**
 * How Fit frames the nodes: some space around them (a fraction of the viewport), and never
 * zoomed past 100% so a small diagram isn't blown up.
 */
export const FIT_OPTIONS = { padding: 0.2, maxZoom: 1 } as const;
