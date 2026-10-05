import type { Flows } from '@modelwright/schema';
import { createEditorContext, isEditingTarget, type DocEditor } from '../editing/editor';

/** The one field being edited on the flows canvas, if any. */
export type EditTarget =
  | { kind: 'name'; screenId: string; selectAll?: boolean }
  | { kind: 'notes'; screenId: string }
  | { kind: 'stateName'; screenId: string; stateId: string; selectAll?: boolean }
  | { kind: 'sees'; screenId: string; stateId: string; index: number }
  /** A new sees item being typed, not yet in the document; `after` null means at the end. */
  | { kind: 'seesDraft'; screenId: string; stateId: string; after: number | null }
  | { kind: 'cta'; screenId: string; stateId: string; ctaId: string }
  /** A new CTA being typed, not yet in the document; `after` null means at the end. */
  | { kind: 'ctaDraft'; screenId: string; stateId: string; after: string | null };

export type FlowsEditor = DocEditor<Flows, EditTarget>;

export const [FlowsEditorContext, useFlowsEditor] = createEditorContext<Flows, EditTarget>('flows');

/** Whether `target` is the field being edited. */
export function isEditing(editing: EditTarget | null, target: EditTarget): boolean {
  return isEditingTarget<EditTarget>(editing, target);
}
