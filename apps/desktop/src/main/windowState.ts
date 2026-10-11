import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeAtomic } from '@modelwright/project/node';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WindowState = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maximized: z.boolean().optional(),
});
export type WindowState = z.infer<typeof WindowState>;

export const DEFAULT_SIZE = { width: 1280, height: 820 };
export const MIN_SIZE = { width: 900, height: 600 };
/** How much of a restored window must be on a screen for it to be put back there. */
const MIN_VISIBLE = { width: 160, height: 80 };

/**
 * Where the window opens: where it was, if that's still on a screen (displays change between
 * launches), at no less than the minimum size; otherwise the default size, placed by the OS.
 */
export function restoreBounds(
  saved: unknown,
  workAreas: readonly Rect[],
): { bounds: Partial<Rect> & { width: number; height: number }; maximized: boolean } {
  const parsed = WindowState.safeParse(saved);
  if (!parsed.success) return { bounds: { ...DEFAULT_SIZE }, maximized: false };
  const s = parsed.data;
  const bounds = {
    x: s.x,
    y: s.y,
    width: Math.max(s.width, MIN_SIZE.width),
    height: Math.max(s.height, MIN_SIZE.height),
  };
  const visible = workAreas.some((area) => {
    const w = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const h = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return w >= MIN_VISIBLE.width && h >= MIN_VISIBLE.height;
  });
  if (!visible) return { bounds: { ...DEFAULT_SIZE }, maximized: s.maximized ?? false };
  return { bounds, maximized: s.maximized ?? false };
}

export function windowStateFile(dataDir: string): string {
  return path.join(dataDir, 'window.json');
}

export async function loadWindowState(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function saveWindowState(file: string, state: WindowState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeAtomic(file, `${JSON.stringify(state, null, 2)}\n`);
}
