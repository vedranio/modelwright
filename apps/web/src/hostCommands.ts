import { useEffect, useRef } from 'react';
import type { HostCommand } from './platform';
import { isShortcutId } from './menuSpec';
import { isTextTarget } from './shortcuts';
import { ENV, availableCombos, shortcut, type ShortcutId } from './shortcutRegistry';

/**
 * Commands from the desktop app's menu, Dock and OS. A command for a registry shortcut runs it
 * as its key would: a synthetic keydown on the focused element, so the same handlers, scopes
 * and text-field rules apply. Undo, Redo and Select All go to a focused text field's own
 * editing instead. The host's other commands go to `useHostCommand` listeners.
 */

type Listener = (command: HostCommand) => void;
const listeners = new Map<string, Set<Listener>>();

/** Field editing the menu routes to a focused text field, not to the canvas. */
const FIELD_EDITS: Partial<Record<ShortcutId, string>> = {
  undo: 'undo',
  redo: 'redo',
  'select-all': 'selectAll',
};

export function routeHostCommand(command: HostCommand): void {
  const { id } = command;
  if (isShortcutId(id)) {
    const field = FIELD_EDITS[id];
    if (field && isTextTarget(document.activeElement)) {
      // execCommand is deprecated, but it's still the only way to reach a field's own undo stack.
      document.execCommand(field);
      return;
    }
    runShortcut(id);
    return;
  }
  for (const listener of listeners.get(id) ?? []) listener(command);
}

/**
 * Runs a shortcut as if its key were pressed. "Anywhere" shortcuts from the menu (⌘O, ⌘W, ⌘R,
 * ⌘1…) work from any focus, as menu commands do in Mac apps; the rest go where the focus is, so
 * a text field keeps its keys.
 */
export function runShortcut(id: ShortcutId): void {
  const combos = availableCombos(id, ENV);
  const combo = combos.find((c) => c.mod) ?? combos[0];
  if (!combo) return;
  const key = combo.key ?? combo.code?.replace(/^Digit|^Key/, '') ?? '';
  const event = new KeyboardEvent('keydown', {
    key,
    code: combo.code ?? '',
    metaKey: ENV.mac && Boolean(combo.mod),
    ctrlKey: !ENV.mac && Boolean(combo.mod),
    shiftKey: combo.shift === true,
    altKey: Boolean(combo.alt),
    bubbles: true,
    cancelable: true,
  });
  const target = shortcut(id).scope === 'global' ? document.body : document.activeElement;
  (target ?? document.body).dispatchEvent(event);
}

/** Calls `handler` for one of the host's own commands (one with no key). */
export function useHostCommand(id: string, handler: Listener, enabled = true): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const listener: Listener = (command) => latest.current(command);
    const set = listeners.get(id) ?? new Set();
    set.add(listener);
    listeners.set(id, set);
    return () => {
      set.delete(listener);
    };
  }, [id, enabled]);
}
