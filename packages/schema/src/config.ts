import { z } from 'zod';
import { Id, checkUniqueIds } from './common';

export const Preview = z.strictObject({
  /** The project's running dev server. v1 reads this only. */
  url: z.string().optional(),
  /** Recorded for later; v1 never runs it. */
  devCommand: z.string().optional(),
});
export type Preview = z.infer<typeof Preview>;

export const Device = z.strictObject({
  id: Id,
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive().optional(),
});
export type Device = z.infer<typeof Device>;

/** Used when `config.json` has no `devices`. */
export const DEFAULT_DEVICES: readonly Device[] = [
  { id: 'mobile', name: 'Mobile', width: 390 },
  { id: 'desktop', name: 'Desktop', width: 1280 },
];

/** `.design/config.json` — project config. */
export const Config = z
  .strictObject({
    schemaVersion: z.literal(1),
    /** Display name for the project. */
    name: z.string().refine((s) => s.trim() !== '', 'Project name must not be empty'),
    preview: Preview,
    devices: z.array(Device).optional(),
  })
  .superRefine((config, ctx) => {
    if (config.devices) checkUniqueIds(ctx, config.devices, ['devices'], 'device');
  });
export type Config = z.infer<typeof Config>;
