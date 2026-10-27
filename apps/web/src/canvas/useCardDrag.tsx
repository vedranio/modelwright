import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ViewportPortal,
  type Node,
  type NodeChange,
  type OnNodeDrag,
  type XYPosition,
} from '@xyflow/react';
import { cardRects } from './cards';
import { SNAP_DISTANCE_PX, boundsOf, snap, type Guide } from './snap';

interface Options<N extends Node> {
  /** Every card as shown, with its position and size. */
  nodes: readonly N[];
  /** The canvas zoom, to turn the snap distance into canvas units. */
  zoom: () => number;
  /** A drag ended: the dragged cards' new positions, as one edit. */
  onMove: (positions: Record<string, XYPosition>) => void;
  /** An ⌥-drag ended: copy these cards, moved by `shift`, and leave them where they were. */
  onCopy: (ids: string[], shift: XYPosition) => void;
}

/** Modifier keys as last seen; pointer and key events both carry them. */
function useModifiers() {
  const keys = useRef({ alt: false, meta: false });
  useEffect(() => {
    const note = (e: KeyboardEvent | PointerEvent | MouseEvent) => {
      keys.current = { alt: e.altKey, meta: e.metaKey };
    };
    const reset = () => {
      keys.current = { alt: false, meta: false };
    };
    window.addEventListener('keydown', note, true);
    window.addEventListener('keyup', note, true);
    window.addEventListener('pointermove', note, true);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', note, true);
      window.removeEventListener('keyup', note, true);
      window.removeEventListener('pointermove', note, true);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return keys;
}

const GHOST = 'ghost:';

/**
 * Dragging cards on a canvas: positions move live and the document changes once, on drop.
 * While dragging, the cards snap to line up with the others, with faint guides (⌘ turns that
 * off). Holding ⌥ drags copies instead: the originals show where they were, and dropping with
 * ⌥ still held adds the copies there; letting go of ⌥ first makes it an ordinary move.
 */
export function useCardDrag<N extends Node>({ nodes, zoom, onMove, onCopy }: Options<N>) {
  const modifiers = useModifiers();
  const [dragging, setDragging] = useState<Record<string, XYPosition>>({});
  const [guides, setGuides] = useState<Guide[]>([]);
  /** The ⌥-drag's cards where they started; null when not copying. */
  const [copyFrom, setCopyFrom] = useState<Record<string, XYPosition> | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const latest = useRef({ nodes, dragging, copyFrom, onMove, onCopy, zoom });
  useLayoutEffect(() => {
    latest.current = { nodes, dragging, copyFrom, onMove, onCopy, zoom };
  });

  const onNodesChange = useCallback(
    (changes: readonly NodeChange<N>[]) => {
      const raw: Record<string, XYPosition> = {};
      for (const c of changes) {
        if (c.type === 'position' && c.dragging && c.position) raw[c.id] = c.position;
      }
      const ids = Object.keys(raw);
      if (ids.length === 0) return;
      const { nodes: all } = latest.current;
      const moving = all.filter((n) => ids.includes(n.id) && !n.id.startsWith(GHOST));
      const others = all.filter((n) => !ids.includes(n.id) && !n.id.startsWith(GHOST));
      const box = boundsOf(
        cardRects(moving.map((n) => ({ ...n, position: raw[n.id] ?? n.position }))),
      );
      const {
        dx,
        dy,
        guides: shown,
      } = box && !modifiers.current.meta
        ? snap(box, cardRects(others), SNAP_DISTANCE_PX / latest.current.zoom())
        : { dx: 0, dy: 0, guides: [] };
      setGuides(shown);
      setAltHeld(modifiers.current.alt);
      setDragging((d) => {
        const next = { ...d };
        for (const id of ids) {
          const p = raw[id] as XYPosition;
          next[id] = { x: p.x + dx, y: p.y + dy };
        }
        return next;
      });
    },
    [modifiers],
  );

  const onNodeDragStart = useCallback<OnNodeDrag<N>>((event, _node, dragged) => {
    setAltHeld(event.altKey);
    setCopyFrom(
      event.altKey ? Object.fromEntries(dragged.map((n) => [n.id, { ...n.position }])) : null,
    );
  }, []);

  const onNodeDragStop = useCallback<OnNodeDrag<N>>(
    (_event, node, dragged) => {
      const { dragging: shown, copyFrom: from, onMove: move, onCopy: copy } = latest.current;
      const final = Object.fromEntries(dragged.map((n) => [n.id, shown[n.id] ?? n.position]));
      const start = from?.[node.id];
      const end = final[node.id];
      if (from && start && end && modifiers.current.alt) {
        copy(Object.keys(from), { x: end.x - start.x, y: end.y - start.y });
      } else {
        move(final);
      }
      setDragging({});
      setGuides([]);
      setCopyFrom(null);
    },
    [modifiers],
  );

  /** The cards to show: dragged ones where they're dragged, plus the originals of a copy. */
  const shown = useCallback(
    (cards: N[]): N[] => {
      const placed = cards.map((n) => (dragging[n.id] ? { ...n, position: dragging[n.id] } : n));
      if (!copyFrom || !altHeld) return placed;
      const ghosts = cards.flatMap((n) => {
        const at = copyFrom[n.id];
        return at
          ? [
              {
                ...n,
                id: `${GHOST}${n.id}`,
                position: at,
                selected: false,
                draggable: false,
                selectable: false,
                connectable: false,
                className: 'drag-ghost',
              } as N,
            ]
          : [];
      });
      return [...ghosts, ...placed];
    },
    [dragging, copyFrom, altHeld],
  );

  const overlay =
    guides.length > 0 ? (
      <ViewportPortal>
        {guides.map((g, i) => (
          <div
            key={i}
            className={`snap-guide snap-guide-${g.axis}`}
            style={
              g.axis === 'x'
                ? { transform: `translate(${g.at}px, ${g.from}px)`, height: g.to - g.from }
                : { transform: `translate(${g.from}px, ${g.at}px)`, width: g.to - g.from }
            }
          />
        ))}
      </ViewportPortal>
    ) : null;

  return { dragging, shown, overlay, onNodesChange, onNodeDragStart, onNodeDragStop };
}
