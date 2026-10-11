import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { MENU, menuShortcutIds, toAccelerator } from '../../web/src/menuSpec';
import { SHORTCUTS, availableCombos, type ShortcutId } from '../../web/src/shortcutRegistry';
import { buildMenuTemplate, type MenuContext } from '../src/main/menu';

const DESKTOP = { mac: true, desktop: true };

function context(overrides: Partial<MenuContext> = {}): MenuContext {
  return { projectOpen: true, theme: 'system', recents: [], send: vi.fn(), ...overrides };
}

/** Every item in the built menu, submenus included. */
function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}

const items = flatten(buildMenuTemplate(context()));

/** Every desktop combo of the registry, as accelerators, by shortcut. */
const registryAccelerators = new Map(
  SHORTCUTS.map((s) => [s.id, availableCombos(s.id, DESKTOP).map(toAccelerator)]),
);

describe('the application menu and the shortcut registry', () => {
  it('gives every accelerator in the menu to a registry shortcut with that combo', () => {
    const withAccelerators = items.filter((item) => item.accelerator && !item.role);
    expect(withAccelerators.length).toBeGreaterThan(10);
    const all = [...registryAccelerators.values()].flat();
    for (const item of withAccelerators) {
      expect(all, `${item.label}: ${String(item.accelerator)}`).toContain(item.accelerator);
    }
  });

  it('lists every shortcut that has a ⌘ key in the desktop app (the menu delivers those)', () => {
    const listed = new Set(menuShortcutIds());
    // ⌘Z in a text field is the field's own undo, which Edit ▸ Undo routes to.
    const deliveredByAnotherItem = new Set<ShortcutId>(['field-undo']);
    for (const s of SHORTCUTS) {
      if (deliveredByAnotherItem.has(s.id)) continue;
      if (availableCombos(s.id, DESKTOP).some((c) => c.mod)) {
        expect(listed.has(s.id), s.id).toBe(true);
      }
    }
  });

  it('lists every desktop-only shortcut, since only the menu can make those work', () => {
    const listed = new Set(menuShortcutIds());
    for (const s of SHORTCUTS) {
      const desktopOnly = (s.combos as readonly { host?: string }[]).every(
        (c) => c.host === 'desktop',
      );
      if (desktopOnly) expect(listed.has(s.id), s.id).toBe(true);
    }
  });

  it('owns ⌘ keys and leaves plain keys to the page, so they stay typeable', () => {
    for (const item of items.filter((i) => i.accelerator && !i.role)) {
      const owned = String(item.accelerator).startsWith('CommandOrControl+');
      expect(item.registerAccelerator, String(item.label)).toBe(owned);
    }
  });

  it('shows the keys the brief asks for', () => {
    const accel = (label: string) => items.find((i) => i.label === label)?.accelerator;
    expect(accel('Reload Design')).toBe('CommandOrControl+R');
    expect(accel('Duplicate')).toBe('CommandOrControl+D');
    expect(accel('ERD')).toBe('CommandOrControl+1');
    expect(accel('Flows')).toBe('CommandOrControl+2');
    expect(accel('UI')).toBe('CommandOrControl+3');
    expect(accel('Undo')).toBe('CommandOrControl+Z');
    expect(accel('Redo')).toBe('CommandOrControl+Shift+Z');
  });

  it('has a menu item id for every shortcut it names', () => {
    const ids = new Set(SHORTCUTS.map((s) => s.id as string));
    for (const id of menuShortcutIds()) expect(ids.has(id)).toBe(true);
  });
});

describe('menu state', () => {
  it('disables project commands with no project open', () => {
    const closed = flatten(buildMenuTemplate(context({ projectOpen: false })));
    const enabled = (label: string) => closed.find((i) => i.label === label)?.enabled;
    expect(enabled('Close Project')).toBe(false);
    expect(enabled('Reload Design')).toBe(false);
    expect(enabled('ERD')).toBe(false);
    expect(enabled('Open…')).toBe(true);
    expect(enabled('New Project')).toBe(true);
  });

  it('checks the current theme, and sends a choice as a command', () => {
    const send = vi.fn();
    const menu = flatten(buildMenuTemplate(context({ theme: 'dark', send })));
    const dark = menu.find((i) => i.label === 'Dark' && i.type === 'radio');
    expect(dark?.checked).toBe(true);
    expect(menu.find((i) => i.label === 'System' && i.type === 'radio')?.checked).toBe(false);
    (menu.find((i) => i.label === 'Light') as { click: () => void }).click();
    expect(send).toHaveBeenCalledWith({ id: 'theme', theme: 'light' });
  });

  it('lists recent projects under Open Recent, opening them by path', () => {
    const send = vi.fn();
    const recents = [
      { name: 'Shop', path: '/p/shop' },
      { name: 'Notes', path: '/p/notes' },
    ];
    const menu = buildMenuTemplate(context({ recents, send }));
    const file = menu.find((m) => m.label === 'File')?.submenu as MenuItemConstructorOptions[];
    const recent = file.find((i) => i.label === 'Open Recent')
      ?.submenu as MenuItemConstructorOptions[];
    expect(recent.map((i) => i.label)).toEqual(['Shop', 'Notes']);
    (recent[1] as { click: () => void }).click();
    expect(send).toHaveBeenCalledWith({ id: 'open-path', path: '/p/notes' });
  });

  it('sends a shortcut’s menu item as that shortcut’s command', () => {
    const send = vi.fn();
    const menu = flatten(buildMenuTemplate(context({ send })));
    (menu.find((i) => i.label === 'Reload Design') as { click: () => void }).click();
    expect(send).toHaveBeenCalledWith({ id: 'reload-design' });
  });

  it('keeps the app and Window menus native', () => {
    const template = buildMenuTemplate(context());
    expect(template[0]).toEqual({ role: 'appMenu' });
    expect(template.some((m) => m.role === 'windowMenu')).toBe(true);
    expect(MENU.length).toBe(template.length);
  });
});
