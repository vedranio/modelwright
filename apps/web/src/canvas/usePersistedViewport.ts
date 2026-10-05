import { useCallback, useMemo } from 'react';
import type { Viewport } from '@xyflow/react';
import { loadPref, savePref } from '../storage';

/**
 * The canvas viewport (pan and zoom), remembered per key in localStorage. It is a per-user
 * convenience, so it never goes into `.design/`. `initial` is null the first time, which means
 * "fit everything in view".
 */
export function usePersistedViewport(key: string): {
  initial: Viewport | null;
  save: (viewport: Viewport) => void;
} {
  const prefKey = `viewport:${key}`;
  // Read once per key; later saves don't need to re-render the canvas.
  const initial = useMemo(() => parseViewport(loadPref(prefKey)), [prefKey]);
  const save = useCallback(
    (viewport: Viewport) => savePref(prefKey, JSON.stringify(viewport)),
    [prefKey],
  );
  return { initial, save };
}

function parseViewport(raw: string | null): Viewport | null {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (
      typeof v === 'object' &&
      v !== null &&
      'x' in v &&
      'y' in v &&
      'zoom' in v &&
      [v.x, v.y, v.zoom].every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      return { x: v.x as number, y: v.y as number, zoom: v.zoom as number };
    }
  } catch {
    // Fall through: a corrupt entry is treated as never saved.
  }
  return null;
}
