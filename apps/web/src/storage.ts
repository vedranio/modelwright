/** localStorage for per-browser conveniences. It can be unavailable, so every access is guarded. */

const PREFIX = 'modelwright.';

export function loadPref(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function savePref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    // Preferences are best-effort.
  }
}
