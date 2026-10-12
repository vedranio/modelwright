import { useEffect, useRef } from 'react';
import { isTextTarget } from '../shortcuts';

interface Actions {
  /** The selected cards as clipboard text, or null when nothing is selected. */
  copy: () => string | null;
  /** As `copy`, and removes the selected cards. */
  cut: () => string | null;
  /** Pastes clipboard text; false when it isn't cards, so nothing happens. */
  paste: (text: string) => boolean;
}

/**
 * ⌘C, ⌘X and ⌘V for cards on a canvas. They come as the page's copy, cut and paste events,
 * which the browser's keys and the desktop app's Edit menu both fire. A text field, selected
 * text or an open dialog keeps them, so copying text works as it always has.
 */
export function useCardClipboard(actions: Actions): void {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });

  useEffect(() => {
    const ownedElsewhere = () =>
      isTextTarget(document.activeElement) ||
      hasSelectedText() ||
      document.querySelector('.dialog-scrim') !== null;

    const onCopyOrCut = (event: ClipboardEvent) => {
      if (event.defaultPrevented || ownedElsewhere() || !event.clipboardData) return;
      const text = event.type === 'cut' ? latest.current.cut() : latest.current.copy();
      if (text === null) return;
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || ownedElsewhere()) return;
      const text = event.clipboardData?.getData('text/plain');
      if (text && latest.current.paste(text)) event.preventDefault();
    };

    document.addEventListener('copy', onCopyOrCut);
    document.addEventListener('cut', onCopyOrCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopyOrCut);
      document.removeEventListener('cut', onCopyOrCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}

function hasSelectedText(): boolean {
  const selection = document.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString().trim() !== '';
}

/** The part of the canvas in view, in flow coordinates, for placing pasted cards. */
export function viewInFlow(
  instance: {
    screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
  } | null,
  container: HTMLElement | null,
): { x: number; y: number; width: number; height: number } | null {
  const rect = container?.getBoundingClientRect();
  if (!rect || !instance) return null;
  const a = instance.screenToFlowPosition({ x: rect.left, y: rect.top });
  const b = instance.screenToFlowPosition({ x: rect.right, y: rect.bottom });
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}
