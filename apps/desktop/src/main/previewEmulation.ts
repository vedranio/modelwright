import type { PreviewLayout } from '@modelwright/core';

/**
 * What the preview emulates for a layout, as Chrome DevTools Protocol parameters: Mobile is a
 * phone (its viewport, a device scale factor of 3, a mobile user agent and touch), Desktop
 * clears all of it but the viewport. Pure, so it's tested without Electron.
 */

/** A current iPhone's Safari, as DevTools' iPhone presets report it. */
export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

export const MOBILE_DEVICE_SCALE_FACTOR = 3;
const MAX_TOUCH_POINTS = 5;

/** Electron's own user agent without its Electron and app tokens: plain desktop Chrome. */
export function desktopUserAgent(electronUserAgent: string): string {
  return electronUserAgent
    .replace(/\s+Electron\/\S+/g, '')
    .replace(/\s+modelwright\/\S+/gi, '')
    .trim();
}

export interface Emulation {
  metrics: {
    width: number;
    height: number;
    /** 0 means the display's own. */
    deviceScaleFactor: number;
    mobile: boolean;
    scale: number;
    screenWidth: number;
    screenHeight: number;
  };
  userAgent: { userAgent: string; platform: string };
  touch: { enabled: boolean; maxTouchPoints?: number };
  mouseAsTouch: { enabled: boolean; configuration: 'mobile' | 'desktop' };
}

export function emulationFor(
  layout: Pick<PreviewLayout, 'viewport' | 'mobile' | 'scale'>,
  electronUserAgent: string,
): Emulation {
  const { viewport, mobile, scale } = layout;
  return {
    metrics: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: mobile ? MOBILE_DEVICE_SCALE_FACTOR : 0,
      mobile,
      scale,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    },
    userAgent: mobile
      ? { userAgent: MOBILE_USER_AGENT, platform: 'iPhone' }
      : { userAgent: desktopUserAgent(electronUserAgent), platform: 'MacIntel' },
    touch: mobile ? { enabled: true, maxTouchPoints: MAX_TOUCH_POINTS } : { enabled: false },
    mouseAsTouch: { enabled: mobile, configuration: mobile ? 'mobile' : 'desktop' },
  };
}

/** Whole pixels for the native view, never smaller than the area it stands in for. */
export function viewBounds(bounds: PreviewLayout['bounds']) {
  const x = Math.floor(bounds.x);
  const y = Math.floor(bounds.y);
  return {
    x,
    y,
    width: Math.ceil(bounds.x + bounds.width) - x,
    height: Math.ceil(bounds.y + bounds.height) - y,
  };
}
