import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import type { Point } from './edgeGeometry';

/**
 * A handle on one end of a selected connector, for moving where it joins its card. Dragging
 * reports the pointer in canvas units; Escape cancels and `onDrag(null)` says so.
 */
export function EndGrip({
  at,
  label,
  onDrag,
  onDrop,
}: {
  at: Point;
  label: string;
  onDrag: (point: Point | null) => void;
  onDrop: (point: Point) => void;
}) {
  const flow = useReactFlow();
  return (
    <EdgeLabelRenderer>
      <div
        className="end-grip nodrag nopan"
        role="button"
        aria-label={label}
        title={`${label} (drag along the card)`}
        style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const toFlow = (e: PointerEvent) =>
            flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          const move = (e: PointerEvent) => onDrag(toFlow(e));
          const finish = () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', up, true);
            window.removeEventListener('keydown', key, true);
          };
          const up = (e: PointerEvent) => {
            finish();
            onDrop(toFlow(e));
          };
          const key = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            finish();
            onDrag(null);
          };
          window.addEventListener('pointermove', move, true);
          window.addEventListener('pointerup', up, true);
          window.addEventListener('keydown', key, true);
        }}
        // The click that ends a drag mustn't reach the canvas and clear the selection.
        onClick={(e) => e.stopPropagation()}
      />
    </EdgeLabelRenderer>
  );
}
