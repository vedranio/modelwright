import { useCallback } from 'react';
import { useShortcut } from '../shortcuts';
import { useToast } from '../Toast';
import type { Touched } from './touched';
import type { DesignDoc } from '../platform';
import type { EditableDoc } from './useEditableDoc';

type CanvasKind = 'erd' | 'flows';

/**
 * Undo and redo for a canvas: ⌘Z and ⇧⌘Z (outside text fields, where they're the field's own),
 * selecting what each step touched, and the undo toast that follows every delete.
 */
export function useCanvasHistory<K extends CanvasKind>(
  kind: K,
  edit: EditableDoc<K>,
  touched: (before: DesignDoc<K>, after: DesignDoc<K>) => Touched,
  select: (nodes: Iterable<string>, edges: Iterable<string>) => void,
) {
  const toast = useToast();
  const { undo: undoDoc, redo: redoDoc, apply, currentRevision } = edit;

  const step = useCallback(
    (move: typeof undoDoc) => {
      const result = move();
      if (!result) return;
      const { nodes, edges } = touched(result.before, result.after);
      select(nodes, edges);
    },
    [touched, select],
  );
  const undo = useCallback(() => step(undoDoc), [step, undoDoc]);
  const redo = useCallback(() => step(redoDoc), [step, redoDoc]);

  useShortcut('undo', (e) => {
    e.preventDefault();
    undo();
  });
  useShortcut('redo', (e) => {
    e.preventDefault();
    redo();
  });

  /** Applies a delete, then shows a toast naming what went, with Undo. */
  const remove = useCallback(
    (
      op: (doc: DesignDoc<K>) => DesignDoc<K>,
      describe: (doc: DesignDoc<K>) => string | null,
      applyOp: (op: (doc: DesignDoc<K>) => DesignDoc<K>) => void = apply,
    ) => {
      let message: string | null = null;
      applyOp((doc) => {
        message = describe(doc);
        return message === null ? doc : op(doc);
      });
      if (message === null) return;
      toast.show({
        message,
        action: { label: 'Undo', onClick: undo },
        owner: { doc: kind, revision: currentRevision() },
      });
    },
    [apply, toast, undo, kind, currentRevision],
  );

  return { undo, redo, remove };
}
