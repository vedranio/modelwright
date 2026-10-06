import { describe, expect, it } from 'vitest';
import {
  SCOPE_TITLES,
  SHORTCUTS,
  comboMatches,
  onPlatform,
  scopesOverlap,
  shortcutHint,
  shortcutMatches,
  type Combo,
  type ShortcutDef,
} from '../src/shortcutRegistry';

const all: readonly ShortcutDef[] = SHORTCUTS;

/** A KeyboardEvent-shaped object; the matcher only reads these fields. */
function key(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  } as KeyboardEvent;
}

/** Two combos that can both match one keydown. */
function collide(a: Combo, b: Combo): boolean {
  const sameKey =
    (a.key !== undefined && a.key.toLowerCase() === b.key?.toLowerCase()) ||
    (a.code !== undefined && a.code === b.code);
  const shiftsMeet =
    a.shift === 'any' || b.shift === 'any' || Boolean(a.shift) === Boolean(b.shift);
  return (
    sameKey && shiftsMeet && Boolean(a.mod) === Boolean(b.mod) && Boolean(a.alt) === Boolean(b.alt)
  );
}

describe('shortcut registry', () => {
  it('has unique ids', () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
  });

  for (const mac of [true, false]) {
    it(`never gives one key two shortcuts in overlapping scopes (${mac ? 'macOS' : 'other'})`, () => {
      const clashes: string[] = [];
      for (const [i, a] of all.entries()) {
        for (const b of all.slice(i + 1)) {
          if (!scopesOverlap(a.scope, b.scope)) continue;
          for (const ca of a.combos.filter((c) => onPlatform(c, mac))) {
            for (const cb of b.combos.filter((c) => onPlatform(c, mac))) {
              if (collide(ca, cb)) clashes.push(`${a.id} / ${b.id}`);
            }
          }
        }
      }
      expect(clashes).toEqual([]);
    });
  }

  it('gives every shortcut an overlay entry: a label, a group and a hint', () => {
    for (const s of all) {
      expect(s.label.length, s.id).toBeGreaterThan(0);
      expect(SCOPE_TITLES[s.scope], s.id).toBeDefined();
      expect(shortcutHint(s.id as never, true).length, s.id).toBeGreaterThan(0);
      expect(shortcutHint(s.id as never, false).length, s.id).toBeGreaterThan(0);
    }
  });

  it('matches the command modifier per platform', () => {
    expect(shortcutMatches('undo', key({ key: 'z', metaKey: true }), true)).toBe(true);
    expect(shortcutMatches('undo', key({ key: 'z', ctrlKey: true }), true)).toBe(false);
    expect(shortcutMatches('undo', key({ key: 'z', ctrlKey: true }), false)).toBe(true);
    expect(shortcutMatches('undo', key({ key: 'Z', metaKey: true, shiftKey: true }), true)).toBe(
      false,
    );
    expect(shortcutMatches('redo', key({ key: 'Z', metaKey: true, shiftKey: true }), true)).toBe(
      true,
    );
    expect(shortcutMatches('redo', key({ key: 'y', ctrlKey: true }), false)).toBe(true);
    expect(shortcutMatches('redo', key({ key: 'y', metaKey: true }), true)).toBe(false);
  });

  it('tells digits apart by Shift and matches them by physical key', () => {
    expect(shortcutMatches('view-erd', key({ key: '1', code: 'Digit1' }))).toBe(true);
    expect(shortcutMatches('view-erd', key({ key: '!', code: 'Digit1', shiftKey: true }))).toBe(
      false,
    );
    expect(shortcutMatches('fit', key({ key: '!', code: 'Digit1', shiftKey: true }))).toBe(true);
    // AZERTY: the unshifted Digit1 key types "&".
    expect(shortcutMatches('view-erd', key({ key: '&', code: 'Digit1' }))).toBe(true);
    expect(shortcutMatches('zoom-reset', key({ key: ')', code: 'Digit0', shiftKey: true }))).toBe(
      true,
    );
  });

  it('accepts + and = for zoom in, with or without Shift, and - for zoom out', () => {
    expect(shortcutMatches('zoom-in', key({ key: '+', shiftKey: true }))).toBe(true);
    expect(shortcutMatches('zoom-in', key({ key: '=' }))).toBe(true);
    expect(shortcutMatches('zoom-in', key({ key: '=', metaKey: true }), true)).toBe(false);
    expect(shortcutMatches('zoom-out', key({ key: '-' }))).toBe(true);
    expect(shortcutMatches('shortcuts', key({ key: '?', shiftKey: true }))).toBe(true);
  });

  it('keeps plain letters free of modifiers', () => {
    expect(shortcutMatches('add-entity', key({ key: 'e' }))).toBe(true);
    expect(shortcutMatches('add-entity', key({ key: 'E', shiftKey: true }))).toBe(false);
    expect(shortcutMatches('add-entity', key({ key: 'e', altKey: true }))).toBe(false);
    expect(
      comboMatches({ key: 'a', mod: true }, key({ key: 'a', metaKey: true, ctrlKey: true }), true),
    ).toBe(false);
  });

  it('renders hints per platform', () => {
    expect(shortcutHint('redo', true)).toBe('⇧⌘Z');
    expect(shortcutHint('redo', false)).toBe('Ctrl+Shift+Z / Ctrl+Y');
    expect(shortcutHint('fit', true)).toBe('⇧1');
    expect(shortcutHint('fit', false)).toBe('Shift+1');
    expect(shortcutHint('add-entity', true)).toBe('E');
    expect(shortcutHint('shortcuts', true)).toBe('?');
  });
});
