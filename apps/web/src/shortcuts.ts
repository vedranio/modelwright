import { useEffect, useRef } from 'react';

/**
 * True when a key event comes from somewhere the user is typing. App shortcuts never fire there;
 * only the field's own Enter and Escape handling does.
 */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(target.type);
  }
  return false;
}

/**
 * Calls `handler` for keydowns that `match` accepts, outside text fields. The handler decides
 * whether to `preventDefault`. The latest handler is always used without re-subscribing.
 */
export function useShortcut(
  match: (event: KeyboardEvent) => boolean,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  const latest = useRef({ match, handler });
  useEffect(() => {
    latest.current = { match, handler };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextTarget(event.target)) return;
      if (latest.current.match(event)) latest.current.handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/** True on macOS (and iOS), where ⌘ is the command modifier; elsewhere it's Ctrl. */
export const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The platform's command modifier is held, and no other modifier besides `shift` when allowed. */
function commandKey(e: KeyboardEvent): boolean {
  return IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** ⌘Z (Ctrl+Z off macOS). */
export const isUndoKey = (e: KeyboardEvent) =>
  commandKey(e) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z';

/** ⇧⌘Z (Ctrl+Shift+Z, or Ctrl+Y, off macOS). */
export const isRedoKey = (e: KeyboardEvent) =>
  commandKey(e) &&
  !e.altKey &&
  ((e.shiftKey && e.key.toLowerCase() === 'z') ||
    (!IS_MAC && !e.shiftKey && e.key.toLowerCase() === 'y'));
