import type { Point } from './edgeGeometry';

/** Space kept between a popover and the canvas's edges, in screen pixels. */
export const POPOVER_MARGIN = 12;
/** Space between the point a popover is for and the popover itself, in screen pixels. */
export const POPOVER_GAP = 16;

export interface Box {
  width: number;
  height: number;
}

/**
 * Where a popover for a point on the canvas goes, as its top-left in screen pixels within the
 * canvas: centred under the point, or above it when there isn't room below, and always held
 * inside the canvas (`bounds`), `POPOVER_MARGIN` from its edges. So it stays in view even when
 * the point itself is near an edge, or off-screen. Pure.
 */
export function placePopover(anchor: Point, size: Box, bounds: Box): Point {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, Math.max(min, max)));

  const left = clamp(
    anchor.x - size.width / 2,
    POPOVER_MARGIN,
    bounds.width - size.width - POPOVER_MARGIN,
  );

  const lowest = bounds.height - size.height - POPOVER_MARGIN;
  const below = anchor.y + POPOVER_GAP;
  const above = anchor.y - POPOVER_GAP - size.height;
  // Below when it fits, else above when that fits, and held inside the canvas either way.
  const top =
    below <= lowest || above < POPOVER_MARGIN
      ? clamp(below, POPOVER_MARGIN, lowest)
      : clamp(above, POPOVER_MARGIN, lowest);
  return { x: Math.round(left), y: Math.round(top) };
}
