/** A device's viewport: a fixed width, and a height or none (fill the available height). */
export interface DeviceSize {
  width: number;
  height?: number;
}

export interface Area {
  width: number;
  height: number;
}

/** The frame drawn around the viewport, in unscaled px: total horizontal and vertical extra. */
export interface Chrome {
  x: number;
  y: number;
}

export interface Fit {
  /** The CSS scale applied to the whole frame. Never above 1. */
  scale: number;
  /** The iframe's own viewport, in CSS px before scaling: always the device's real width. */
  viewportWidth: number;
  viewportHeight: number;
}

/** The smallest viewport height a height-less device gets when the area is tiny or hidden. */
const MIN_FILL_HEIGHT = 1;

/**
 * Scales a device frame to fit `area` whole. It never scales up. The viewport keeps the
 * device's real width, so the app lays out as it would on the device. A device with no height
 * fills all the available height: at a scale below 1 that's more CSS px than the area has,
 * so the scaled frame still reaches the bottom.
 */
export function fitScale(device: DeviceSize, area: Area, chrome: Chrome): Fit {
  const frameWidth = device.width + chrome.x;
  const byWidth = area.width > 0 ? area.width / frameWidth : 1;

  if (device.height === undefined) {
    const scale = floor3(Math.min(1, byWidth));
    const viewportHeight = Math.max(MIN_FILL_HEIGHT, Math.floor(area.height / scale - chrome.y));
    return { scale, viewportWidth: device.width, viewportHeight };
  }

  const frameHeight = device.height + chrome.y;
  const byHeight = area.height > 0 ? area.height / frameHeight : 1;
  const scale = floor3(Math.min(1, byWidth, byHeight));
  return { scale, viewportWidth: device.width, viewportHeight: device.height };
}

/** Rounds down, so a scaled frame never overflows the area by a fraction of a pixel. */
function floor3(n: number): number {
  return Math.floor(n * 1000) / 1000;
}

/** `0.75` → `"75%"`. */
export function scaleLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
