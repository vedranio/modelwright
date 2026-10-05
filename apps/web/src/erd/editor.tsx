import { createContext, useContext } from 'react';
import type { Erd } from '@modelwright/schema';

/** The one field being edited on the canvas, if any. */
export type EditTarget =
  | { kind: 'name'; entityId: string; selectAll?: boolean }
  | { kind: 'description'; entityId: string }
  | { kind: 'attribute'; entityId: string; attributeId: string }
  | { kind: 'note'; entityId: string; attributeId: string }
  /** A new attribute being typed, not yet in the document; `after` null means at the end. */
  | { kind: 'draft'; entityId: string; after: string | null };

export interface ErdEditor {
  /** Applies an operation to the document; see useEditableDoc. */
  apply: (op: (erd: Erd) => Erd, options?: { saveNow?: boolean }) => void;
  editing: EditTarget | null;
  setEditing: (target: EditTarget | null) => void;
}

export const ErdEditorContext = createContext<ErdEditor | null>(null);

export function useErdEditor(): ErdEditor {
  const editor = useContext(ErdEditorContext);
  if (!editor) throw new Error('useErdEditor must be used inside the ERD canvas');
  return editor;
}

/** Whether `target` is the field being edited. */
export function isEditing(editing: EditTarget | null, target: EditTarget): boolean {
  if (!editing || editing.kind !== target.kind || editing.entityId !== target.entityId) {
    return false;
  }
  if ('attributeId' in target && 'attributeId' in editing) {
    return editing.attributeId === target.attributeId;
  }
  if (target.kind === 'draft' && editing.kind === 'draft') return editing.after === target.after;
  return true;
}
