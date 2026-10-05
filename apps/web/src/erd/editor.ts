import type { Erd } from '@modelwright/schema';
import { createEditorContext, isEditingTarget, type DocEditor } from '../editing/editor';

/** The one field being edited on the canvas, if any. */
export type EditTarget =
  | { kind: 'name'; entityId: string; selectAll?: boolean }
  | { kind: 'description'; entityId: string }
  | { kind: 'attribute'; entityId: string; attributeId: string }
  | { kind: 'note'; entityId: string; attributeId: string }
  /** A new attribute being typed, not yet in the document; `after` null means at the end. */
  | { kind: 'draft'; entityId: string; after: string | null };

export type ErdEditor = DocEditor<Erd, EditTarget>;

export const [ErdEditorContext, useErdEditor] = createEditorContext<Erd, EditTarget>('ERD');

/** Whether `target` is the field being edited. */
export function isEditing(editing: EditTarget | null, target: EditTarget): boolean {
  return isEditingTarget<EditTarget>(editing, target);
}
