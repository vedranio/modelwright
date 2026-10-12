import type { Layout, Position } from '@modelwright/schema';
import { DUPLICATE_OFFSET } from '../editing/reorder';
import type { EntityFragment } from '../erd/ops';
import type { ScreenFragment } from '../flows/ops';
import type { Rect } from './edgeGeometry';

/**
 * Cards on the clipboard. Copied cards go on the system clipboard as tagged JSON text, so they
 * paste into another project, or between the desktop app and the web build. Pure: encoding,
 * decoding and working out where a paste lands. Pasting validates the resulting document, so
 * decoding only checks the shape it needs.
 */

const TAG = 'modelwright/cards';
const VERSION = 1;

export type ClipboardCards =
  | { kind: 'erd'; project: string; fragment: EntityFragment }
  | { kind: 'flows'; project: string; fragment: ScreenFragment };

export function encodeCards(cards: ClipboardCards): string {
  return JSON.stringify({ [TAG]: VERSION, ...cards }, null, 2);
}

/** The cards in clipboard text, or null when it isn't modelwright's. */
export function decodeCards(text: string): ClipboardCards | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value[TAG] !== VERSION || typeof value['project'] !== 'string') {
    return null;
  }
  const fragment = value['fragment'];
  if (!isRecord(fragment) || !isRecord(fragment['layout'])) return null;
  const project = value['project'];
  if (value['kind'] === 'erd' && isArrays(fragment, 'entities', 'relationships')) {
    return { kind: 'erd', project, fragment: fragment as unknown as EntityFragment };
  }
  if (value['kind'] === 'flows' && isArrays(fragment, 'screens', 'transitions')) {
    return { kind: 'flows', project, fragment: fragment as unknown as ScreenFragment };
  }
  return null;
}

/**
 * How far pasted cards move from where they were copied. In the same project they go one grid
 * step down and right, like Duplicate, and a step further for each paste already sitting there.
 * In another project they keep their place unless a card is already exactly there. If that
 * leaves them all outside the view, they're centred in it instead.
 */
export function pasteShift(
  fragmentLayout: Layout,
  existing: Layout,
  sameProject: boolean,
  view: Rect | null,
): Position {
  const positions = Object.values(fragmentLayout);
  const first = positions[0];
  if (!first) return { x: 0, y: 0 };
  const taken = new Set(Object.values(existing).map((p) => `${p.x},${p.y}`));
  let step = sameProject ? 1 : 0;
  while (
    step < 100 &&
    taken.has(`${first.x + step * DUPLICATE_OFFSET},${first.y + step * DUPLICATE_OFFSET}`)
  ) {
    step++;
  }
  const shift = { x: step * DUPLICATE_OFFSET, y: step * DUPLICATE_OFFSET };
  if (!view) return shift;

  const xs = positions.map((p) => p.x + shift.x);
  const ys = positions.map((p) => p.y + shift.y);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
  const inView =
    box.right >= view.x &&
    box.x <= view.x + view.width &&
    box.bottom >= view.y &&
    box.y <= view.y + view.height;
  if (inView) return shift;
  // Centre the cards' top-left corners on the view; cards extend right and down from those.
  const centre = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  return {
    x: Math.round(shift.x + centre.x - (box.x + box.right) / 2),
    y: Math.round(shift.y + centre.y - (box.y + box.bottom) / 2),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArrays(record: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.every((k) => Array.isArray(record[k]));
}
