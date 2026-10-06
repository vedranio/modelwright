import { useEffect, useRef } from 'react';
import { shortcutMatches, type ShortcutId } from './shortcutRegistry';

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
 * App shortcuts use `useShortcut`, which goes through the registry; this is for a control's
 * own keys, like the picker's list navigation.
 */
export function useKeydown(
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

/** Calls `handler` for the registered shortcut `id`, outside text fields. */
export function useShortcut(
  id: ShortcutId,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  useKeydown((e) => shortcutMatches(id, e), handler, enabled);
}
