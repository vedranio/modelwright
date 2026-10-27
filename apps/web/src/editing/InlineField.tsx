import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { shortcutMatches } from '../shortcutRegistry';

export type CommitReason = 'enter' | 'blur';

const COMMIT_EVENT = 'modelwright:commit-field';

/**
 * Commits the open field, if there is one, as a blur would. A field stays open while the app
 * is in the background, so saving before a close or quit calls this first. Resolves once
 * React has applied the commit.
 */
export function commitOpenField(): Promise<void> {
  window.dispatchEvent(new Event(COMMIT_EVENT));
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Frames to keep retrying focus while the node is still hidden. */
const FOCUS_ATTEMPTS = 10;

interface Props {
  value: string;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
  /** Select the whole value on open, e.g. a new entity's placeholder name. */
  selectAll?: boolean;
  onCommit: (value: string, reason: CommitReason) => void;
  onCancel: () => void;
  /** Tab: commit and move to the next field. Without it, Tab leaves the field as usual. */
  onTab?: (value: string) => void;
  /**
   * ⌥↑ / ⌥↓: move this row up or down. The handler saves the text and moves the row; the
   * field stays open on it, even if the row's element is moved or replaced.
   */
  onMove?: (value: string, offset: -1 | 1) => void;
}

/**
 * A text input that edits one field in place on a canvas node. Enter or blur commits, Escape
 * cancels, Tab (when given) commits and moves on. `nodrag` and `nowheel` keep typing and selecting text from dragging or zooming the
 * canvas, and app shortcuts ignore text fields.
 */
export function InlineField({
  value,
  placeholder,
  className = '',
  ariaLabel,
  selectAll = false,
  onCommit,
  onCancel,
  onTab,
  onMove,
}: Props) {
  const [draft, setDraft] = useState(value);
  // A field can open a render before its node's data catches up (React Flow passes node data
  // through its store a render later than the editor context), e.g. on the row a sees item
  // just moved into. Until the user types, the draft follows the value.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (draft === shown) setDraft(value);
  }
  const ref = useRef<HTMLInputElement>(null);
  /** Set once committed or cancelled, so the blur that follows doesn't commit again. */
  const settled = useRef(false);

  useLayoutEffect(() => {
    // A node React Flow hasn't measured yet (a brand-new entity) is hidden, and a hidden input
    // can't take focus, so keep trying for a few frames until it shows.
    let frame = 0;
    let handle = 0;
    const focus = () => {
      const input = ref.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      if (document.activeElement !== input) {
        if (frame++ < FOCUS_ATTEMPTS) handle = requestAnimationFrame(focus);
        return;
      }
      if (selectAll) input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
    };
    focus();
    return () => cancelAnimationFrame(handle);
  }, [selectAll]);

  /** Set while a ⌥↑/⌥↓ move re-renders the row, so focus comes back here afterwards. */
  const moving = useRef(false);
  // Re-renders after a move, even one that changed nothing (the first row moved up).
  const [, setMoves] = useState(0);
  useLayoutEffect(() => {
    if (!moving.current) return;
    moving.current = false;
    settled.current = false;
    const input = ref.current;
    if (input && document.activeElement !== input) {
      const { selectionStart, selectionEnd } = input;
      input.focus({ preventScroll: true });
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  });

  const settle = (action: () => void) => {
    if (settled.current) return;
    settled.current = true;
    action();
  };

  // Saving before a close or quit commits a field left open while the app was in the
  // background (see `commitOpenField`).
  const latest = useRef({ draft, onCommit });
  useLayoutEffect(() => {
    latest.current = { draft, onCommit };
  });
  useEffect(() => {
    const commit = () => settle(() => latest.current.onCommit(latest.current.draft, 'blur'));
    window.addEventListener(COMMIT_EVENT, commit);
    return () => window.removeEventListener(COMMIT_EVENT, commit);
  }, []);

  return (
    <input
      ref={ref}
      className={`inline-input nodrag nowheel ${className}`}
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        // Keep keys inside the field: nothing on the canvas should react to typing.
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          settle(() => onCommit(draft, 'enter'));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          settle(onCancel);
        } else if (e.key === 'Tab' && !e.shiftKey && onTab) {
          e.preventDefault();
          settle(() => onTab(draft));
        } else if (onMove && shortcutMatches('move-row', e.nativeEvent)) {
          e.preventDefault();
          // Moving the row may move or replace this element; a blur meanwhile mustn't commit.
          settled.current = true;
          moving.current = true;
          setMoves((n) => n + 1);
          onMove(draft, e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      onBlur={() => {
        // Switching to another app blurs the field too. It stays open, and the browser gives
        // it focus back when the window returns, so typing carries on where it left off.
        if (!document.hasFocus()) return;
        settle(() => onCommit(draft, 'blur'));
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
