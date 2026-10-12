import { useSyncExternalStore } from 'react';
import type { IconName } from './Icon';
import { loadPref, savePref } from './storage';

/** System follows the OS live; Light and Dark override it. */
export type ThemeSetting = 'system' | 'light' | 'dark';

export const THEMES: readonly { id: ThemeSetting; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'contrast' },
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

// One setting for the whole page, so the header's menu and the desktop app's View ▸ Theme agree.
let current: ThemeSetting | null = null;
const subscribers = new Set<() => void>();

export function getTheme(): ThemeSetting {
  current ??= loadTheme();
  return current;
}

/** Applies, saves and announces a theme setting. */
export function setTheme(next: ThemeSetting): void {
  applyTheme(next);
  savePref(KEY, next === 'system' ? null : next);
  current = next;
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/** The remembered theme setting, and a setter that applies and saves it. */
export function useTheme(): [ThemeSetting, (theme: ThemeSetting) => void] {
  return [useSyncExternalStore(subscribe, getTheme), setTheme];
}
