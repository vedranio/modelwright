import {
  availableCombos,
  shortcut,
  type Combo,
  type Env,
  type ShortcutId,
} from './shortcutRegistry';

/**
 * The desktop app's application menu, as data. Electron's main process builds the native menu
 * from it, and the renderer reads it to know which keys the menu delivers, so the menu, the
 * handlers and the hints all come from the shortcut registry and can't disagree.
 *
 * A command item's `id` is a registry shortcut id when it has one: choosing the item runs that
 * shortcut's handler, exactly as the key does. Other ids are the host's own commands.
 */
export type MenuItemSpec =
  | {
      kind: 'command';
      id: ShortcutId | HostOnlyCommand;
      label: string;
      /** Disabled while no project is open. */
      needsProject?: boolean;
    }
  /** Electron's built-in items: cut, copy and paste work in text fields only through these. */
  | { kind: 'role'; role: NativeRole; label?: string }
  | { kind: 'separator' }
  /** File ▸ Open Recent: the recent projects. */
  | { kind: 'recent'; label: string }
  /** View ▸ Theme: System, Light, Dark. */
  | { kind: 'theme'; label: string };

export type NativeRole =
  | 'appMenu'
  | 'windowMenu'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'pasteAndMatchStyle'
  | 'togglefullscreen'
  | 'toggleDevTools';

/** Commands with no key: they only come from the menu. */
export type HostOnlyCommand = 'how-it-works' | 'theme' | 'open-path' | 'close-for-quit';

export interface MenuSection {
  label: string;
  /** A whole native menu (the app menu, Window). */
  role?: 'appMenu' | 'windowMenu';
  items: MenuItemSpec[];
}

const command = (id: ShortcutId | HostOnlyCommand, label: string, needsProject = false) =>
  ({ kind: 'command', id, label, needsProject }) as const;
const separator = { kind: 'separator' } as const;

export const MENU: readonly MenuSection[] = [
  { label: 'modelwright', role: 'appMenu', items: [] },
  {
    label: 'File',
    items: [
      command('new-project', 'New Project'),
      command('open-project', 'Open…'),
      { kind: 'recent', label: 'Open Recent' },
      separator,
      command('close-project', 'Close Project', true),
    ],
  },
  {
    label: 'Edit',
    items: [
      command('undo', 'Undo'),
      command('redo', 'Redo'),
      separator,
      { kind: 'role', role: 'cut' },
      { kind: 'role', role: 'copy' },
      { kind: 'role', role: 'paste' },
      command('select-all', 'Select All'),
      separator,
      command('duplicate', 'Duplicate', true),
      command('delete', 'Delete', true),
    ],
  },
  {
    label: 'View',
    items: [
      command('view-erd', 'ERD', true),
      command('view-flows', 'Flows', true),
      command('view-ui', 'UI', true),
      separator,
      command('reload-design', 'Reload Design', true),
      command('reload-preview', 'Reload Preview', true),
      separator,
      command('zoom-in', 'Zoom In', true),
      command('zoom-out', 'Zoom Out', true),
      command('zoom-reset', 'Actual Size', true),
      command('fit', 'Fit to Screen', true),
      separator,
      { kind: 'theme', label: 'Theme' },
      separator,
      { kind: 'role', role: 'togglefullscreen' },
      { kind: 'role', role: 'toggleDevTools', label: 'Developer Tools' },
    ],
  },
  { label: 'Window', role: 'windowMenu', items: [] },
  {
    label: 'Help',
    items: [
      command('how-it-works', 'How modelwright Works'),
      command('shortcuts', 'Keyboard Shortcuts'),
    ],
  },
];

const DESKTOP_MAC: Env = { mac: true, desktop: true };

/** Every registry shortcut the menu lists. */
export function menuShortcutIds(menu: readonly MenuSection[] = MENU): ShortcutId[] {
  const ids: ShortcutId[] = [];
  for (const section of menu) {
    for (const item of section.items) {
      if (item.kind === 'command' && isShortcutId(item.id)) ids.push(item.id);
    }
  }
  return ids;
}

export function isShortcutId(id: string): id is ShortcutId {
  try {
    return shortcut(id as ShortcutId) !== undefined;
  } catch {
    return false;
  }
}

/**
 * The combo a menu item shows: one with ⌘ when there is one (the menu delivers it), otherwise
 * the shortcut's own plain key, shown for reference but left to the page so it stays typeable.
 */
export function menuCombo(
  id: ShortcutId,
  env: Env = DESKTOP_MAC,
): { combo: Combo; owned: boolean } | null {
  const combos = availableCombos(id, env);
  const withMod = combos.find((c) => c.mod);
  if (withMod) return { combo: withMod, owned: true };
  const first = combos[0];
  return first ? { combo: first, owned: false } : null;
}

/** The combos the menu delivers itself; the page ignores real keydowns for these. */
export function menuOwnedCombos(env: Env = DESKTOP_MAC): { id: ShortcutId; combo: Combo }[] {
  return menuShortcutIds()
    .map((id) => ({ id, entry: menuCombo(id, env) }))
    .filter((x) => x.entry?.owned)
    .map(({ id, entry }) => ({ id, combo: (entry as { combo: Combo }).combo }));
}

const ACCELERATOR_KEYS: Record<string, string> = {
  '+': 'Plus',
  '-': '-',
  '=': '=',
  '?': '?',
  Escape: 'Escape',
  Enter: 'Return',
  Tab: 'Tab',
  Delete: 'Delete',
  Backspace: 'Backspace',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** A combo as an Electron accelerator, e.g. `CommandOrControl+Shift+Z`. */
export function toAccelerator(combo: Combo): string {
  const raw = combo.key ?? combo.code?.replace(/^Digit|^Key/, '') ?? '';
  const key = ACCELERATOR_KEYS[raw] ?? (raw.length === 1 ? raw.toUpperCase() : raw);
  return [combo.mod && 'CommandOrControl', combo.alt && 'Alt', combo.shift === true && 'Shift', key]
    .filter(Boolean)
    .join('+');
}
