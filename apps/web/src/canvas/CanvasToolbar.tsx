import { Fragment, type ReactNode } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useShortcut } from '../shortcuts';
import { Kbd } from '../ui';
import { tokenNumber } from './tokens';

/** ⇧1, matched by physical key so it works whatever Shift+1 types on the layout. */
const isFitKey = (e: KeyboardEvent) =>
  e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'Digit1';

/**
 * The floating toolbar centred at the bottom of the canvas, as in 04-shell-erd: the view's own
 * actions, then zoom out, the zoom percentage, zoom in and Fit.
 */
export function CanvasToolbar({ actions }: { actions?: ReactNode }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const duration = () => tokenNumber('--duration-fast');
  const fit = () => void flow.fitView({ ...FIT_OPTIONS, duration: duration() });

  useShortcut(isFitKey, (e) => {
    e.preventDefault();
    fit();
  });

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
        title="Zoom out"
        onClick={() => void flow.zoomOut({ duration: duration() })}
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
        title="Zoom in"
        onClick={() => void flow.zoomIn({ duration: duration() })}
      >
        +
      </button>
      <span className="divider" aria-hidden="true" />
      <button type="button" className="btn btn-quiet btn-tight" onClick={fit}>
        Fit
        <Kbd>⇧1</Kbd>
      </button>
    </div>
  );
}

/**
 * How Fit frames the nodes: some space around them (a fraction of the viewport), and never
 * zoomed past 100% so a small diagram isn't blown up.
 */
export const FIT_OPTIONS = { padding: 0.2, maxZoom: 1 } as const;
