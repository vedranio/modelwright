import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useViewport } from '@xyflow/react';
import type { Point } from './edgeGeometry';
import { placePopover, type Box } from './popoverPlacement';

/**
 * Holds an edge's popover (relationship or transition details) for a point on the edge, given
 * in canvas units. It's drawn in screen space over the canvas, not inside the zoomed layer, so
 * it keeps its size at any zoom and `placePopover` can keep it in view: below the point, above
 * it when there's no room below, and never past the canvas's edges.
 */
export function EdgePopoverAnchor({ at, children }: { at: Point; children: ReactNode }) {
  const { x, y, zoom } = useViewport();
  const container = useStore((s) => s.domNode);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Box | null>(null);

  // Measured now and whenever its content changes size while it's open.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [container]);

  if (!container) return null;
  const spot = placePopover(
    { x: at.x * zoom + x, y: at.y * zoom + y },
    size ?? { width: 0, height: 0 },
    { width: container.clientWidth, height: container.clientHeight },
  );
  return createPortal(
    <div
      ref={ref}
      className="edge-popover-anchor"
      // Hidden for the one frame before it's measured, so it never flashes in the wrong place.
      style={{ left: spot.x, top: spot.y, visibility: size ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    container,
  );
}
