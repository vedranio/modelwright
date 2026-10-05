import { DEFAULT_DEVICES, type Config, type Device } from '@modelwright/schema';

/** Devices narrower than this get a phone-like frame; wider ones a window frame. */
export const NARROW_DEVICE_MAX = 768;

/** The project's devices, or the built-in presets when it has none (absent or empty). */
export function resolveDevices(config: Config): readonly Device[] {
  return config.devices && config.devices.length > 0 ? config.devices : DEFAULT_DEVICES;
}

/** The remembered device when it still exists, otherwise the first. */
export function pickDevice(devices: readonly Device[], savedId: string | null): Device {
  const first = devices[0];
  if (!first) throw new Error('pickDevice needs at least one device');
  return devices.find((d) => d.id === savedId) ?? first;
}

/** `390 × 844`, or `390 × fill` for a device with no height. */
export function sizeLabel(device: Device): string {
  return `${device.width} × ${device.height ?? 'fill'}`;
}

export function isNarrow(device: Device): boolean {
  return device.width < NARROW_DEVICE_MAX;
}
