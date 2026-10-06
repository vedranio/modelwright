import { createContext, useContext, type Context } from 'react';
import type { ApplyOptions } from './useEditableDoc';

/**
 * What a canvas's nodes need to edit their document: apply an operation, and know or change
 * the one field being edited. Each view supplies its own document and edit-target types.
 */
export interface DocEditor<Doc, Target> {
  /** Applies an operation to the document; see useEditableDoc. */
  apply: (op: (doc: Doc) => Doc, options?: ApplyOptions) => void;
  /**
   * Applies a delete and shows its undo toast. `describe` words it from the document before
   * the delete (e.g. "Deleted attribute 'email'"); null means there's nothing to delete.
   */
  remove: (op: (doc: Doc) => Doc, describe: (doc: Doc) => string | null) => void;
  editing: Target | null;
  setEditing: (target: Target | null) => void;
}

/** A context for one view's editor, and the hook that reads it (throwing outside the canvas). */
export function createEditorContext<Doc, Target>(
  name: string,
): [Context<DocEditor<Doc, Target> | null>, () => DocEditor<Doc, Target>] {
  const EditorContext = createContext<DocEditor<Doc, Target> | null>(null);
  const useEditor = () => {
    const editor = useContext(EditorContext);
    if (!editor) throw new Error(`The ${name} editor is only available inside its canvas`);
    return editor;
  };
  return [EditorContext, useEditor];
}

/**
 * Whether `target` is the field being edited: every key of `target` matches, apart from
 * `selectAll`, which only says how the field opens.
 */
export function isEditingTarget<Target extends object>(
  editing: Target | null,
  target: Target,
): boolean {
  if (!editing) return false;
  return Object.entries(target).every(
    ([key, value]) => key === 'selectAll' || (editing as Record<string, unknown>)[key] === value,
  );
}
