import { useCallback, useState } from 'react';
import type { IconName } from './Icon';
import { loadPref, savePref } from './storage';

/** System follows the OS live; Light and Dark override it. */
export type ThemeSetting = 'system' | 'light' | 'dark';

export const THEMES: readonly { id: ThemeSetting; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'brightness_auto' },
  { id: 'light', label: 'Light', icon: 'light_mode' },
  { id: 'dark', label: 'Dark', icon: 'dark_mode' },
];

const KEY = 'theme';

export function loadTheme(): ThemeSetting {
  const saved = loadPref(KEY);
  return THEMES.find((t) => t.id === saved)?.id ?? 'system';
}

/**
 * Sets `data-theme` on <html> for Light and Dark, and removes it for System, where
 * tokens.css follows `prefers-color-scheme` without any script. index.html does the same
 * before first paint, so a dark page never flashes light.
 */
export function applyTheme(theme: ThemeSetting): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** The remembered theme setting, and a setter that applies and saves it. */
export function useTheme(): [ThemeSetting, (theme: ThemeSetting) => void] {
  const [theme, setThemeState] = useState(loadTheme);
  const setTheme = useCallback((next: ThemeSetting) => {
    applyTheme(next);
    savePref(KEY, next === 'system' ? null : next);
    setThemeState(next);
  }, []);
  return [theme, setTheme];
}
