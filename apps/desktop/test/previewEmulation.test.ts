import { describe, expect, it } from 'vitest';
import { IPC_ARGS, PreviewLayout } from '@modelwright/core';
import {
  MOBILE_DEVICE_SCALE_FACTOR,
  MOBILE_USER_AGENT,
  desktopUserAgent,
  emulationFor,
  viewBounds,
} from '../src/main/previewEmulation';

const ELECTRON_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) modelwright/0.1.0 Chrome/146.0.0.0 Electron/44.5.1 Safari/537.36';

describe('emulationFor', () => {
  it('makes Mobile a phone: its viewport, a high scale factor, a mobile user agent and touch', () => {
    const e = emulationFor(
      { viewport: { width: 390, height: 844 }, mobile: true, scale: 0.8 },
      ELECTRON_UA,
    );
    expect(e.metrics).toEqual({
      width: 390,
      height: 844,
      deviceScaleFactor: MOBILE_DEVICE_SCALE_FACTOR,
      mobile: true,
      scale: 0.8,
      screenWidth: 390,
      screenHeight: 844,
    });
    expect(e.userAgent.userAgent).toBe(MOBILE_USER_AGENT);
    expect(e.touch).toEqual({ enabled: true, maxTouchPoints: 5 });
    expect(e.mouseAsTouch.enabled).toBe(true);
  });

  it('clears everything but the viewport for Desktop, with a plain Chrome user agent', () => {
    const e = emulationFor(
      { viewport: { width: 1280, height: 800 }, mobile: false, scale: 1 },
      ELECTRON_UA,
    );
    expect(e.metrics.deviceScaleFactor).toBe(0);
    expect(e.metrics.mobile).toBe(false);
    expect(e.touch).toEqual({ enabled: false });
    expect(e.mouseAsTouch.enabled).toBe(false);
    expect(e.userAgent.userAgent).not.toMatch(/Electron|modelwright/);
    expect(e.userAgent.userAgent).toMatch(/Chrome\/146/);
  });
});

describe('desktopUserAgent', () => {
  it('removes only Electron’s and the app’s tokens', () => {
    expect(desktopUserAgent(ELECTRON_UA)).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    );
  });
});

describe('viewBounds', () => {
  it('covers the whole area in whole pixels', () => {
    expect(viewBounds({ x: 10.4, y: 20.6, width: 100.2, height: 50.1 })).toEqual({
      x: 10,
      y: 20,
      width: 101,
      height: 51,
    });
  });
});

describe('the preview layout argument', () => {
  const layout = {
    url: 'http://localhost:5173/',
    reload: 0,
    bounds: { x: 0, y: 0, width: 390, height: 844 },
    viewport: { width: 390, height: 844 },
    mobile: true,
    scale: 1,
    radius: 24,
    visible: true,
  };

  it('accepts a layout, or null to remove the preview', () => {
    expect(IPC_ARGS.setPreview.safeParse([layout]).success).toBe(true);
    expect(IPC_ARGS.setPreview.safeParse([null]).success).toBe(true);
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'app://modelwright/index.html',
    'not a url',
  ])('never loads %s', (url) => {
    expect(PreviewLayout.safeParse({ ...layout, url }).success).toBe(false);
  });

  it('refuses an upscale, unknown keys and absurd sizes', () => {
    expect(PreviewLayout.safeParse({ ...layout, scale: 2 }).success).toBe(false);
    expect(PreviewLayout.safeParse({ ...layout, extra: true }).success).toBe(false);
    expect(
      PreviewLayout.safeParse({ ...layout, viewport: { width: 1e6, height: 10 } }).success,
    ).toBe(false);
  });
});
