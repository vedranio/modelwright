import type { MenuItemConstructorOptions } from 'electron';
import type { HostCommand, HostState } from '@modelwright/core';
import type { ProjectSummary } from '@modelwright/schema';
import {
  MENU,
  isShortcutId,
  menuCombo,
  toAccelerator,
  type MenuItemSpec,
} from '../../../web/src/menuSpec';

export interface MenuContext extends HostState {
  recents: readonly Pick<ProjectSummary, 'name' | 'path'>[];
  /** Sends a command to the renderer. */
  send(command: HostCommand): void;
}

/** How many projects File ▸ Open Recent and the Dock menu list. */
export const RECENT_MENU_LIMIT = 10;

const THEME_ITEMS = [
  { theme: 'system', label: 'System' },
  { theme: 'light', label: 'Light' },
  { theme: 'dark', label: 'Dark' },
] as const;

/**
 * The application menu, from the shared spec. A shortcut's item shows its key and, when the key
 * has ⌘, owns it (the page ignores the real keydown). Plain keys are shown but left to the page,
 * so they stay typeable in text fields.
 */
export function buildMenuTemplate(ctx: MenuContext): MenuItemConstructorOptions[] {
  return MENU.map((section) => {
    if (section.role) return { role: section.role };
    return {
      label: section.label,
      ...(section.label === 'Help' && { role: 'help' as const }),
      submenu: section.items.map((item) => menuItem(item, ctx)),
    };
  });
}

function menuItem(item: MenuItemSpec, ctx: MenuContext): MenuItemConstructorOptions {
  switch (item.kind) {
    case 'separator':
      return { type: 'separator' };
    case 'role':
      return { role: item.role, ...(item.label && { label: item.label }) };
    case 'recent':
      return { label: item.label, submenu: recentItems(ctx) };
    case 'theme':
      return {
        label: item.label,
        submenu: THEME_ITEMS.map(({ theme, label }) => ({
          label,
          type: 'radio',
          checked: ctx.theme === theme,
          click: () => ctx.send({ id: 'theme', theme }),
        })),
      };
    case 'command': {
      const shown = isShortcutId(item.id) ? menuCombo(item.id) : null;
      return {
        label: item.label,
        enabled: !item.needsProject || ctx.projectOpen,
        ...(shown && {
          accelerator: toAccelerator(shown.combo),
          registerAccelerator: shown.owned,
        }),
        click: () => ctx.send({ id: item.id }),
      };
    }
  }
}

export function recentItems(
  ctx: Pick<MenuContext, 'recents' | 'send'>,
): MenuItemConstructorOptions[] {
  if (ctx.recents.length === 0) return [{ label: 'No Recent Projects', enabled: false }];
  return ctx.recents.slice(0, RECENT_MENU_LIMIT).map((project) => ({
    label: project.name,
    toolTip: project.path,
    click: () => ctx.send({ id: 'open-path', path: project.path }),
  }));
}
