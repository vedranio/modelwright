import { describe, expect, it } from 'vitest';
import { DEFAULT_DEVICES, type Config } from '@modelwright/schema';
import { isNarrow, pickDevice, resolveDevices, sizeLabel } from '../src/preview/devices';
import { fitScale, scaleLabel } from '../src/preview/scale';

const chrome = { x: 24, y: 24 };

describe('fitScale', () => {
  it('keeps a device that fits at 1', () => {
    expect(fitScale({ width: 390, height: 844 }, { width: 1400, height: 900 }, chrome)).toEqual({
      scale: 1,
      viewportWidth: 390,
      viewportHeight: 844,
    });
  });

  it('never scales up in a huge area', () => {
    const fit = fitScale({ width: 390, height: 600 }, { width: 5000, height: 5000 }, chrome);
    expect(fit.scale).toBe(1);
  });

  it('scales down to fit the width, frame included', () => {
    const fit = fitScale({ width: 1280, height: 800 }, { width: 978, height: 2000 }, chrome);
    expect(fit.scale).toBe(0.75);
    expect(fit.viewportWidth).toBe(1280);
  });

  it('scales down to fit the height, frame included', () => {
    const fit = fitScale({ width: 390, height: 844 }, { width: 1400, height: 434 }, chrome);
    expect(fit.scale).toBe(0.5);
    expect(fit.viewportHeight).toBe(844);
  });

  it('fits whole: the scaled frame is never larger than the area', () => {
    for (const area of [
      { width: 1000, height: 700 },
      { width: 333, height: 777 },
      { width: 1919, height: 487 },
    ]) {
      for (const device of [
        { width: 390, height: 844 },
        { width: 1280, height: 800 },
        { width: 1920, height: 1080 },
      ]) {
        const { scale } = fitScale(device, area, chrome);
        expect((device.width + chrome.x) * scale).toBeLessThanOrEqual(area.width);
        expect((device.height + chrome.y) * scale).toBeLessThanOrEqual(area.height);
      }
    }
  });

  it('fills the available height for a device without one', () => {
    const fit = fitScale({ width: 390 }, { width: 1400, height: 800 }, chrome);
    expect(fit).toEqual({ scale: 1, viewportWidth: 390, viewportHeight: 776 });
  });

  it('fills the height in CSS px when the width scales down', () => {
    const fit = fitScale({ width: 1280 }, { width: 978, height: 600 }, chrome);
    expect(fit.scale).toBe(0.75);
    expect(fit.viewportHeight).toBe(776); // 600 / 0.75 - 24
    expect((fit.viewportHeight + chrome.y) * fit.scale).toBeLessThanOrEqual(600);
  });

  it('copes with a hidden (zero-size) area', () => {
    const fit = fitScale({ width: 1280 }, { width: 0, height: 0 }, chrome);
    expect(fit.scale).toBe(1);
    expect(fit.viewportHeight).toBeGreaterThan(0);
  });
});

describe('scaleLabel', () => {
  it('shows a whole percentage', () => {
    expect(scaleLabel(0.75)).toBe('75%');
    expect(scaleLabel(0.666)).toBe('67%');
  });
});

describe('devices', () => {
  const config = (devices?: Config['devices']): Config => ({
    schemaVersion: 1,
    name: 'x',
    preview: {},
    ...(devices && { devices }),
  });
  const phone = { id: 'phone', name: 'Phone', width: 375, height: 667 };
  const wide = { id: 'wide', name: 'Wide', width: 1440 };

  it('uses the presets when there are no devices, or an empty list', () => {
    expect(resolveDevices(config())).toBe(DEFAULT_DEVICES);
    expect(resolveDevices(config([]))).toBe(DEFAULT_DEVICES);
  });

  it('uses custom devices in place of the presets', () => {
    expect(resolveDevices(config([phone, wide]))).toEqual([phone, wide]);
  });

  it('picks the remembered device, falling back to the first', () => {
    expect(pickDevice([phone, wide], 'wide')).toBe(wide);
    expect(pickDevice([phone, wide], 'gone')).toBe(phone);
    expect(pickDevice([phone, wide], null)).toBe(phone);
  });

  it('labels sizes', () => {
    expect(sizeLabel(phone)).toBe('375 × 667');
    expect(sizeLabel(wide)).toBe('1440 × fill');
  });

  it('frames narrow devices as phones', () => {
    expect(isNarrow(phone)).toBe(true);
    expect(isNarrow(wide)).toBe(false);
  });
});
