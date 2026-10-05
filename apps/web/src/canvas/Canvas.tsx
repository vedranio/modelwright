import type { ReactNode } from 'react';
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type ReactFlowProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import './canvas.css';
import { CanvasToolbar, FIT_OPTIONS } from './CanvasToolbar';
import { tokenNumber } from './tokens';
import { usePersistedViewport } from './usePersistedViewport';

/** Props React Flow gets from Canvas itself; consumers can't override them. */
type Owned =
  | 'defaultViewport'
  | 'fitView'
  | 'fitViewOptions'
  | 'onMoveEnd'
  | 'minZoom'
  | 'maxZoom'
  | 'panOnScroll'
  | 'zoomOnScroll'
  | 'zoomOnPinch'
  | 'panOnDrag'
  | 'selectionOnDrag'
  | 'proOptions'
  | 'zoomOnDoubleClick'
  | 'deleteKeyCode'
  | 'children';

export type CanvasProps<N extends Node, E extends Edge> = Omit<ReactFlowProps<N, E>, Owned> & {
  /** Identifies this canvas for viewport persistence, e.g. `erd:/path/to/project`. */
  viewportKey: string;
  /** The view's own toolbar actions, shown before the zoom controls. */
  toolbarActions?: ReactNode;
  /** Bottom-left slot, for the save status. */
  status?: ReactNode;
  /** Shown centred over the canvas, e.g. an empty state. Doesn't block the canvas around it. */
  overlay?: ReactNode;
};

export const MIN_ZOOM = 0.2;
const DELETE_KEYS = ['Delete', 'Backspace'];
export const MAX_ZOOM = 2;

/**
 * The shared canvas: an infinite dot grid that pans and zooms like Figma on a trackpad. It knows
 * nothing about entities or screens; views pass in their own node types, edge types and handlers.
 */
export function Canvas<N extends Node, E extends Edge>(props: CanvasProps<N, E>) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner<N extends Node, E extends Edge>({
  viewportKey,
  toolbarActions,
  status,
  overlay,
  ...flowProps
}: CanvasProps<N, E>) {
  const viewport = usePersistedViewport(viewportKey);
  const gap = tokenNumber('--dot-grid-gap');
  const dot = tokenNumber('--dot-grid-radius') * 2;

  return (
    <div className="canvas">
      <ReactFlow<N, E>
        {...flowProps}
        {...(viewport.initial
          ? { defaultViewport: viewport.initial }
          : { fitView: true, fitViewOptions: FIT_OPTIONS })}
        onMoveEnd={(_event, v) => viewport.save(v)}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        // Trackpad: two-finger scroll pans, pinch zooms, ⌘+scroll zooms (zoomActivationKeyCode).
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        // Pointer: drag on empty canvas draws a selection box; middle-drag or Space+drag pans.
        selectionOnDrag
        panOnDrag={[1]}
        multiSelectionKeyCode="Shift"
        // Double-click on empty canvas belongs to the view (e.g. creating a node), not to zoom.
        zoomOnDoubleClick={false}
        // Delete or Backspace deletes the selection; React Flow ignores them inside text fields.
        deleteKeyCode={DELETE_KEYS}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={gap} size={dot} />
        {overlay && <div className="canvas-overlay">{overlay}</div>}
        <Panel position="bottom-left" className="canvas-panel">
          {status}
        </Panel>
        <Panel position="bottom-center" className="canvas-panel">
          <CanvasToolbar actions={toolbarActions} />
        </Panel>
      </ReactFlow>
    </div>
  );
}
