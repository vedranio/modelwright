import { shortcutHint } from '../shortcutRegistry';

interface Props {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Undo and redo in the canvas toolbar: the same steps as ⌘Z and ⇧⌘Z, selection included. */
export function UndoRedoButtons({ undo, redo, canUndo, canRedo }: Props) {
  return (
    <>
      <button
        type="button"
        className="btn-icon btn-glyph"
        aria-label="Undo"
        title={`Undo (${shortcutHint('undo')})`}
        disabled={!canUndo}
        onClick={undo}
      >
        ↶
      </button>
      <button
        type="button"
        className="btn-icon btn-glyph"
        aria-label="Redo"
        title={`Redo (${shortcutHint('redo')})`}
        disabled={!canRedo}
        onClick={redo}
      >
        ↷
      </button>
    </>
  );
}
