/**
 * Every keyboard shortcut in the shell, in one place. Handlers (`useShortcut`), keyboard hints
 * (`shortcutHint`) and the shortcuts overlay all read these entries, so they can't drift apart:
 * a shortcut the browser wins comes out of here and disappears from all three.
 *
 * The project picker's list keys (↑ ↓ ↵) and the dialogs' ↵ and esc belong to those controls,
 * like a text field's own keys, and aren't listed.
 */

export const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * One key combination. `key` matches `KeyboardEvent.key` case-insensitively; `code` matches the
 * physical key, for digits whose character depends on the layout and Shift. Modifiers not
 * given must not be held, except `shift: 'any'`, for keys like ? and + that Shift produces.
 */
export interface Combo {
  key?: string;
  code?: string;
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean | 'any';
  alt?: boolean;
  /** Only on macOS, or only elsewhere. */
  platform?: 'mac' | 'other';
}

/**
 * Where a shortcut works. Canvas shortcuts work on both canvases; `field` ones belong to a text
 * field and only work while it has focus. App shortcuts never fire inside text fields.
 */
export type Scope = 'global' | 'canvas' | 'erd' | 'flows' | 'field';

export interface ShortcutDef {
  id: string;
  label: string;
  scope: Scope;
  combos: Combo[];
  /** How the overlay and hints show it; defaults to the first combo's rendering. */
  display?: { mac: string; other: string };
}

const arrows = (extra: Partial<Combo>): Combo[] =>
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((key) => ({ key, ...extra }));

export const SHORTCUTS = [
  // Anywhere outside a text field
  { id: 'view-erd', label: 'Switch to ERD', scope: 'global', combos: [{ code: 'Digit1' }] },
  { id: 'view-flows', label: 'Switch to Flows', scope: 'global', combos: [{ code: 'Digit2' }] },
  { id: 'view-ui', label: 'Switch to UI', scope: 'global', combos: [{ code: 'Digit3' }] },
  {
    id: 'shortcuts',
    label: 'Show keyboard shortcuts',
    scope: 'global',
    combos: [{ key: '?', shift: 'any' }],
  },

  // Both canvases
  { id: 'undo', label: 'Undo', scope: 'canvas', combos: [{ key: 'z', mod: true }] },
  {
    id: 'redo',
    label: 'Redo',
    scope: 'canvas',
    combos: [
      { key: 'z', mod: true, shift: true },
      { key: 'y', mod: true, platform: 'other' },
    ],
  },
  { id: 'select-all', label: 'Select all', scope: 'canvas', combos: [{ key: 'a', mod: true }] },
  {
    id: 'duplicate',
    label: 'Duplicate selection',
    scope: 'canvas',
    combos: [{ key: 'd', mod: true }],
  },
  {
    id: 'delete',
    label: 'Delete selection',
    scope: 'canvas',
    combos: [{ key: 'Delete' }, { key: 'Backspace' }],
    display: { mac: '⌫', other: 'Delete' },
  },
  { id: 'deselect', label: 'Clear selection', scope: 'canvas', combos: [{ key: 'Escape' }] },
  {
    id: 'nudge',
    label: 'Nudge selection 1 unit',
    scope: 'canvas',
    combos: arrows({}),
    display: { mac: '↑ ↓ ← →', other: '↑ ↓ ← →' },
  },
  {
    id: 'nudge-far',
    label: 'Nudge selection 10 units',
    scope: 'canvas',
    combos: arrows({ shift: true }),
    display: { mac: '⇧ ↑ ↓ ← →', other: 'Shift ↑ ↓ ← →' },
  },
  {
    id: 'zoom-in',
    label: 'Zoom in',
    scope: 'canvas',
    combos: [
      { key: '+', shift: 'any' },
      { key: '=', shift: 'any' },
    ],
    display: { mac: '+', other: '+' },
  },
  {
    id: 'zoom-out',
    label: 'Zoom out',
    scope: 'canvas',
    combos: [{ key: '-' }],
    display: { mac: '−', other: '−' },
  },
  {
    id: 'zoom-reset',
    label: 'Zoom to 100%',
    scope: 'canvas',
    combos: [{ code: 'Digit0', shift: true }],
  },
  { id: 'fit', label: 'Fit to screen', scope: 'canvas', combos: [{ code: 'Digit1', shift: true }] },
  { id: 'add-entity', label: 'Add entity', scope: 'erd', combos: [{ key: 'e' }] },
  { id: 'add-screen', label: 'Add screen', scope: 'flows', combos: [{ key: 's' }] },

  // Inside a field on a card
  {
    id: 'field-commit',
    label: 'Save the field (and add the next item in a list)',
    scope: 'field',
    combos: [{ key: 'Enter' }],
  },
  {
    id: 'field-next',
    label: 'Save and go to the next field',
    scope: 'field',
    combos: [{ key: 'Tab' }],
  },
  { id: 'field-cancel', label: 'Cancel the edit', scope: 'field', combos: [{ key: 'Escape' }] },
  {
    id: 'move-row',
    label: 'Move the row up or down',
    scope: 'field',
    combos: [
      { key: 'ArrowUp', alt: true },
      { key: 'ArrowDown', alt: true },
    ],
    display: { mac: '⌥↑ ⌥↓', other: 'Alt+↑ Alt+↓' },
  },
  {
    id: 'field-undo',
    label: 'Undo typing in the field',
    scope: 'field',
    combos: [{ key: 'z', mod: true }],
  },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

const BY_ID = new Map<string, ShortcutDef>(SHORTCUTS.map((s) => [s.id, s]));

export function shortcut(id: ShortcutId): ShortcutDef {
  return BY_ID.get(id) as ShortcutDef;
}

/** The overlay's groups, in order. */
export const SCOPE_TITLES: Record<Scope, string> = {
  global: 'Anywhere',
  canvas: 'ERD and Flows',
  erd: 'ERD',
  flows: 'Flows',
  field: 'While editing a field',
};

/** Whether a combo applies on this platform. */
export function onPlatform(combo: Combo, mac = IS_MAC): boolean {
  return combo.platform === undefined || (combo.platform === 'mac') === mac;
}

/** Whether a key event is this combo. */
export function comboMatches(combo: Combo, e: KeyboardEvent, mac = IS_MAC): boolean {
  if (!onPlatform(combo, mac)) return false;
  const modHeld = mac ? e.metaKey : e.ctrlKey;
  const otherCommandHeld = mac ? e.ctrlKey : e.metaKey;
  if (modHeld !== Boolean(combo.mod) || otherCommandHeld) return false;
  if (e.altKey !== Boolean(combo.alt)) return false;
  if (combo.shift !== 'any' && e.shiftKey !== Boolean(combo.shift)) return false;
  if (combo.code !== undefined && e.code !== combo.code) return false;
  if (combo.key !== undefined && e.key.toLowerCase() !== combo.key.toLowerCase()) return false;
  return true;
}

export function shortcutMatches(id: ShortcutId, e: KeyboardEvent, mac = IS_MAC): boolean {
  return shortcut(id).combos.some((c) => comboMatches(c, e, mac));
}

const KEY_NAMES: Record<string, string> = {
  Escape: 'esc',
  Enter: '↵',
  Tab: 'Tab',
  Delete: 'Delete',
  Backspace: '⌫',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** How a combo reads in a hint: ⇧⌘Z on macOS, Ctrl+Shift+Z elsewhere. */
export function renderCombo(combo: Combo, mac = IS_MAC): string {
  const raw = combo.key ?? combo.code?.replace(/^Digit|^Key/, '') ?? '';
  const key = KEY_NAMES[raw] ?? (raw.length === 1 ? raw.toUpperCase() : raw);
  if (mac) {
    return `${combo.alt ? '⌥' : ''}${combo.shift === true ? '⇧' : ''}${combo.mod ? '⌘' : ''}${key}`;
  }
  const parts = [combo.mod && 'Ctrl', combo.alt && 'Alt', combo.shift === true && 'Shift', key];
  return parts.filter(Boolean).join('+');
}

/** The hint for a shortcut, e.g. "⇧1" or "E". */
export function shortcutHint(id: ShortcutId, mac = IS_MAC): string {
  const def = shortcut(id);
  if (def.display) return mac ? def.display.mac : def.display.other;
  const combos = def.combos.filter((c) => onPlatform(c, mac));
  return combos.map((c) => renderCombo(c, mac)).join(' / ');
}

/** Whether two scopes can be active at once (both fire on the same keydown). */
export function scopesOverlap(a: Scope, b: Scope): boolean {
  if (a === b) return true;
  if (a === 'field' || b === 'field') return false;
  if (a === 'global' || b === 'global') return true;
  return a === 'canvas' || b === 'canvas';
}
