import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { Rect } from './edgeGeometry';
import { tokenNumber } from './tokens';

/** Each card's rectangle in canvas units: its position and measured (or estimated) size. */
export function cardRects(nodes: readonly Node[]): Rect[] {
  return nodes.map((n) => ({
    ...n.position,
    width: n.measured?.width ?? n.initialWidth ?? 0,
    height: n.measured?.height ?? n.initialHeight ?? 0,
  }));
}

/**
 * The card a new one is placed beside: the selected card when exactly one is selected,
 * otherwise the last one added (the last in document order). Null on an empty canvas.
 */
export function anchorCard(nodes: readonly Node[], selected: ReadonlySet<string>): Rect | null {
  const chosen = nodes.filter((n) => selected.has(n.id));
  const anchor = chosen.length === 1 ? chosen[0] : nodes[nodes.length - 1];
  return anchor ? (cardRects([anchor])[0] ?? null) : null;
}

/**
 * The canvas element and node under a screen point. It looks through everything stacked
 * there, so an edge label or line drawn over a card doesn't hide the card from a drop.
 */
export function nodeUnderPoint(
  x: number,
  y: number,
): { node: HTMLElement; element: Element } | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const node = element.closest<HTMLElement>('.react-flow__node');
    if (node) return { node, element };
  }
  return null;
}

/** Pans, keeping the zoom, so that `rect` is fully in view if it isn't already. */
export function revealCard(
  instance: Pick<ReactFlowInstance, 'getViewport' | 'setCenter'>,
  container: HTMLElement,
  rect: Rect,
): void {
  const { x, y, zoom } = instance.getViewport();
  const bounds = container.getBoundingClientRect();
  const left = rect.x * zoom + x;
  const top = rect.y * zoom + y;
  const visible =
    left >= 0 &&
    top >= 0 &&
    left + rect.width * zoom <= bounds.width &&
    top + rect.height * zoom <= bounds.height;
  if (visible) return;
  void instance.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
    zoom,
    duration: tokenNumber('--duration-fast'),
  });
}
