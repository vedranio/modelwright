import { describe, expect, it } from 'vitest';
import { parseDesignJson, stringifyDesign, type Erd } from '@modelwright/schema';
import { keepUnchanged, type DocState } from '../src/docState';
import {
  applyEdit,
  initialEditableState,
  resolveDoc,
  saveFailed,
  saveRefused,
  saveStarted,
  saveSucceeded,
  type EditableState,
} from '../src/editing/editableState';
import { renameEntity } from '../src/erd/ops';
import { notesErd, notesErdText } from './fixtures';
import { must } from './helpers';

/**
 * The hook's state logic, driven the way Shell drives it: useDesign's on-disk state (re-reads
 * pass through keepUnchanged; saves are recorded with noteWritten) beside useEditableDoc's state.
 */
function harness(initial: Erd) {
  let disk: DocState<'erd'> = { status: 'ok', doc: initial };
  let state: EditableState<'erd'> = initialEditableState();
  const onDisk = () => (disk.status === 'ok' ? disk.doc : null);
  const h = {
    doc: () => must(resolveDoc('erd', state, onDisk())),
    state: () => state,
    edit(fn: (erd: Erd) => Erd) {
      state = applyEdit(fn(h.doc()));
      return state.local;
    },
    /** A successful save of the current working copy, as writeLatest does it. */
    save() {
      const target = must(state.local);
      state = saveStarted(state);
      disk = { status: 'ok', doc: target }; // noteWritten
      state = saveSucceeded(state, target);
    },
    /** A re-read (Reload or window focus) that finds `text` on disk. */
    reread(text: string) {
      const parsed = parseDesignJson('erd', text);
      if (!parsed.ok) throw new Error('fixture text is invalid');
      disk = keepUnchanged('erd', disk, { status: 'ok', doc: parsed.doc });
    },
    discard() {
      state = initialEditableState();
    },
  };
  return h;
}

const text = (erd: Erd) => stringifyDesign('erd', erd);
const firstId = (erd: Erd) => must(erd.entities[0]).id;

describe('editable state', () => {
  it('shows a file reverted on disk to its pre-edit text after Reload (phase 3 bug)', () => {
    const original = notesErd();
    const h = harness(original);
    h.edit((erd) => renameEntity(erd, firstId(erd), 'Renamed'));
    h.save();
    expect(h.doc().entities[0]?.name).toBe('Renamed');

    // The file is reverted by hand to exactly what it was, then Reload re-reads it.
    h.reread(notesErdText());
    expect(text(h.doc())).toBe(text(original));
    expect(h.doc().entities[0]?.name).not.toBe('Renamed');
  });

  it('keeps showing a saved edit before anything re-reads the file', () => {
    const h = harness(notesErd());
    h.edit((erd) => renameEntity(erd, firstId(erd), 'Renamed'));
    h.save();
    expect(h.state().dirty).toBe(false);
    expect(h.doc().entities[0]?.name).toBe('Renamed');
  });

  it('keeps the working copy object when our own save is read back', () => {
    const h = harness(notesErd());
    const edited = h.edit((erd) => renameEntity(erd, firstId(erd), 'Renamed'));
    h.save();
    h.reread(text(must(edited)));
    expect(h.doc()).toBe(edited);
  });

  it('keeps unsaved edits over a newer file on disk', () => {
    const h = harness(notesErd());
    const edited = h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine'));
    h.reread(text(renameEntity(notesErd(), firstId(notesErd()), 'Theirs')));
    expect(h.doc()).toBe(edited);
  });

  it('lets a different file on disk take over once clean', () => {
    const h = harness(notesErd());
    h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine'));
    h.save();
    h.reread(text(renameEntity(notesErd(), firstId(notesErd()), 'Theirs')));
    expect(h.doc().entities[0]?.name).toBe('Theirs');
    // Later edits build on what's now shown.
    h.edit((erd) => ({ ...erd, entities: erd.entities.slice(1) }));
    expect(h.doc().entities[0]?.name).not.toBe('Theirs');
  });

  it('stays dirty when an edit lands during a save', () => {
    const target = notesErd();
    saveStarted(applyEdit<'erd'>(target));
    const later = applyEdit<'erd'>(renameEntity(target, firstId(target), 'Later'));
    const state = saveSucceeded(later, target);
    expect(state.dirty).toBe(true);
    expect(state.local?.entities[0]?.name).toBe('Later');
  });

  it('stops offering a clean copy once the file on disk becomes invalid', () => {
    const state = saveSucceeded(applyEdit<'erd'>(notesErd()), notesErd());
    const clean = { ...state, dirty: false };
    expect(resolveDoc('erd', clean, null)).toBeNull();
    // Unsaved edits still win: they're the user's.
    expect(resolveDoc('erd', applyEdit<'erd'>(notesErd()), null)).not.toBeNull();
  });

  it('falls back to the file on disk on discard', () => {
    const original = notesErd();
    const h = harness(original);
    h.edit((erd) => renameEntity(erd, firstId(erd), 'Unsaved'));
    h.discard();
    expect(h.doc()).toBe(original);
  });

  it('keeps the edits when a save fails or is refused', () => {
    const edited = applyEdit<'erd'>(renameEntity(notesErd(), firstId(notesErd()), 'Kept'));
    const failed = saveFailed(saveStarted(edited));
    expect(failed).toMatchObject({ dirty: true, status: 'failed', local: edited.local });
    const refused = saveRefused(edited, [{ path: ['entities'], message: 'bad' }]);
    expect(refused).toMatchObject({ dirty: true, status: 'invalid', local: edited.local });
    expect(resolveDoc('erd', failed, notesErd())).toBe(edited.local);
  });
});
