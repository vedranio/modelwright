import { useEffect, useRef } from 'react';
import { useShortcut } from '../shortcuts';

/** How far one arrow press nudges, in canvas units; with Shift, ten times as far. */
export const NUDGE = 1;
export const NUDGE_FAR = 10;

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

interface Actions {
  selectAll: () => void;
  deselect: () => void;
  /** Duplicates the selected nodes. */
  duplicate: () => void;
  /**
   * Moves the selected nodes. Calls in one burst share `coalesce`, so a held arrow key lands
   * as one undo step (and, with the autosave pause, one save).
   */
  nudge: (dx: number, dy: number, coalesce: string) => void;
}

/** The selection shortcuts both canvases share: ⌘A, Esc, ⌘D and the arrow keys. */
export function useCanvasShortcuts({ selectAll, deselect, duplicate, nudge }: Actions) {
  // A burst of nudges ends when the arrow key is released.
  const burst = useRef(0);
  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key in ARROWS) burst.current++;
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, []);

  useShortcut('select-all', (e) => {
    e.preventDefault();
    selectAll();
  });
  useShortcut('deselect', () => deselect());
  useShortcut('duplicate', (e) => {
    e.preventDefault();
    duplicate();
  });
  const onArrow = (far: boolean) => (e: KeyboardEvent) => {
    const direction = ARROWS[e.key];
    if (!direction) return;
    e.preventDefault();
    const step = far ? NUDGE_FAR : NUDGE;
    nudge(direction[0] * step, direction[1] * step, `nudge:${burst.current}`);
  };
  useShortcut('nudge', onArrow(false));
  useShortcut('nudge-far', onArrow(true));
}
