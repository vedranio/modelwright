import { describe, expect, it } from 'vitest';
import { parseDesignJson, stringifyDesign, type Erd } from '@modelwright/schema';
import { keepUnchanged, type DocState } from '../src/docState';
import {
  applyEdit,
  historyFor,
  hold,
  initialEditableState,
  keepMine,
  redoEdit,
  resolveDoc,
  undoEdit,
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
    edit(fn: (erd: Erd) => Erd, coalesce?: string, now?: number) {
      const shown = h.doc();
      state = applyEdit(state, shown, fn(shown), {
        ...(coalesce !== undefined && { coalesce }),
        ...(now !== undefined && { now }),
      });
      return state.local;
    },
    undo() {
      const next = undoEdit(state, h.doc());
      if (next) state = next;
      return next !== null;
    },
    redo() {
      const next = redoEdit(state, h.doc());
      if (next) state = next;
      return next !== null;
    },
    history: () => historyFor(state, h.doc()),
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
/** A fresh working-copy state holding `doc` as an edit. */
const edited = (doc: Erd) => applyEdit<'erd'>(initialEditableState(), notesErd(), doc);
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
    const saving = saveStarted(edited(target));
    const later = applyEdit(saving, target, renameEntity(target, firstId(target), 'Later'));
    const state = saveSucceeded(later, target);
    expect(state.dirty).toBe(true);
    expect(state.local?.entities[0]?.name).toBe('Later');
  });

  it('stops offering a clean copy once the file on disk becomes invalid', () => {
    const state = saveSucceeded(edited(notesErd()), notesErd());
    const clean = { ...state, dirty: false };
    expect(resolveDoc('erd', clean, null)).toBeNull();
    // Unsaved edits still win: they're the user's.
    expect(resolveDoc('erd', edited(notesErd()), null)).not.toBeNull();
  });

  it('falls back to the file on disk on discard', () => {
    const original = notesErd();
    const h = harness(original);
    h.edit((erd) => renameEntity(erd, firstId(erd), 'Unsaved'));
    h.discard();
    expect(h.doc()).toBe(original);
  });

  it('keeps the edits when a save fails or is refused', () => {
    const kept = edited(renameEntity(notesErd(), firstId(notesErd()), 'Kept'));
    const failed = saveFailed(saveStarted(kept));
    expect(failed).toMatchObject({ dirty: true, status: 'failed', local: kept.local });
    const refused = saveRefused(kept, [{ path: ['entities'], message: 'bad' }]);
    expect(refused).toMatchObject({ dirty: true, status: 'invalid', local: kept.local });
    expect(resolveDoc('erd', failed, notesErd())).toBe(kept.local);
  });

  describe('undo history', () => {
    const name = (h: ReturnType<typeof harness>) => h.doc().entities[0]?.name;

    it('undoes and redoes edits through the working copy, which then saves', () => {
      const h = harness(notesErd());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'One'));
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Two'));
      h.save();
      expect(h.undo()).toBe(true);
      expect(name(h)).toBe('One');
      expect(h.state()).toMatchObject({ dirty: true, status: 'unsaved' });
      expect(h.undo()).toBe(true);
      expect(name(h)).toBe('User');
      expect(h.undo()).toBe(false);
      expect(h.redo()).toBe(true);
      expect(h.redo()).toBe(true);
      expect(name(h)).toBe('Two');
      expect(h.redo()).toBe(false);
    });

    it('clears the redo stack on a new edit', () => {
      const h = harness(notesErd());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'One'));
      h.undo();
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Other'));
      expect(h.redo()).toBe(false);
      expect(name(h)).toBe('Other');
    });

    it('is cleared when the file on disk replaces the working copy', () => {
      const h = harness(notesErd());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine'));
      h.save();
      h.reread(text(renameEntity(notesErd(), firstId(notesErd()), 'Theirs')));
      expect(h.history().past).toHaveLength(0);
      expect(h.undo()).toBe(false);
      // A later edit starts a fresh history from what's shown.
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Next'));
      expect(h.history().past).toHaveLength(1);
      h.undo();
      expect(name(h)).toBe('Theirs');
    });

    it('is kept when our own save is read back', () => {
      const h = harness(notesErd());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine'));
      h.save();
      h.reread(text(h.doc()));
      expect(h.undo()).toBe(true);
      expect(name(h)).toBe('User');
    });

    it('is cleared on discard', () => {
      const h = harness(notesErd());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine'));
      h.discard();
      expect(h.undo()).toBe(false);
    });

    it('coalesces a burst of nudges into one step', () => {
      const h = harness(notesErd());
      const nudge = (dx: number) => (erd: Erd) => {
        const at = must(erd.layout[firstId(erd)]);
        return { ...erd, layout: { ...erd.layout, [firstId(erd)]: { x: at.x + dx, y: at.y } } };
      };
      const start = must(h.doc().layout[firstId(h.doc())]).x;
      h.edit(nudge(1), 'nudge', 0);
      h.edit(nudge(1), 'nudge', 100);
      h.edit(nudge(1), 'nudge', 200);
      expect(h.history().past).toHaveLength(1);
      h.undo();
      expect(h.doc().layout[firstId(h.doc())]?.x).toBe(start);
    });

    it('counts revisions for edits, undos and redos', () => {
      const h = harness(notesErd());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'One'));
      h.undo();
      h.redo();
      expect(h.state().revision).toBe(3);
    });
  });

  describe('hold after an external change', () => {
    it('holds only with unsaved edits, and edits keep applying while held', () => {
      const h = harness(notesErd());
      expect(hold(h.state())).toBe(h.state());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine'));
      const held = hold(h.state());
      expect(held).toMatchObject({ held: true, status: 'held', dirty: true });
      const later = applyEdit(
        held,
        must(held.local),
        renameEntity(must(held.local), 'user', 'Later'),
      );
      expect(later).toMatchObject({ held: true, status: 'held' });
      expect(undoEdit(later, later.local)).toMatchObject({ held: true, status: 'held' });
    });

    it('resumes saving on "keep mine"', () => {
      const h = harness(notesErd());
      h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine'));
      expect(keepMine(hold(h.state()))).toMatchObject({ held: false, status: 'unsaved' });
    });

    it('stays held when a save already on its way lands', () => {
      const h = harness(notesErd());
      const target = must(h.edit((erd) => renameEntity(erd, firstId(erd), 'Mine')));
      const landed = saveSucceeded(hold(saveStarted(h.state())), target);
      expect(landed).toMatchObject({ held: true, status: 'held', dirty: false });
    });
  });
});
