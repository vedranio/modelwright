import { describe, expect, it } from 'vitest';
import { parseDesignJson, stringifyErd, type Erd } from '@modelwright/schema';
import {
  addAttribute,
  addEntity,
  addRelationship,
  moveEntities,
  renameEntity,
  reverseRelationship,
  updateAttribute,
} from '../src/erd/ops';
import { notesErd, notesErdText } from './fixtures';

function reparse(erd: Erd): Erd {
  const result = parseDesignJson('erd', stringifyErd(erd));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.doc;
}

/** Lines that differ between two texts of equal line count (or all, if counts differ). */
function changedLines(a: string, b: string): number {
  const la = a.split('\n');
  const lb = b.split('\n');
  if (la.length !== lb.length) return Math.max(la.length, lb.length);
  return la.filter((line, i) => line !== lb[i]).length;
}

describe('round trip', () => {
  it('the untouched fixture stringifies to its own text', () => {
    expect(stringifyErd(notesErd())).toBe(notesErdText());
  });

  it.each([
    ['addEntity', (e: Erd) => addEntity(e, { x: 40, y: 400 }).erd],
    ['addAttribute', (e: Erd) => addAttribute(e, 'user', 'user-email').erd],
    ['addRelationship', (e: Erd) => addRelationship(e, 'note', 'user').erd],
    ['reverseRelationship', (e: Erd) => reverseRelationship(e, 'user-notes')],
    ['moveEntities', (e: Erd) => moveEntities(e, { note: { x: 360, y: 80 } })],
  ])('%s survives stringify and parse unchanged', (_name, op) => {
    const edited = op(notesErd());
    expect(reparse(edited)).toEqual(edited);
  });

  it('renaming an entity changes exactly one line', () => {
    const text = stringifyErd(renameEntity(notesErd(), 'note', 'Memo'));
    expect(changedLines(notesErdText(), text)).toBe(1);
    expect(text).toContain('"name": "Memo"');
  });

  it('renaming an attribute changes exactly one line', () => {
    const text = stringifyErd(
      updateAttribute(notesErd(), 'note', 'note-body', { name: 'content' }),
    );
    expect(changedLines(notesErdText(), text)).toBe(1);
  });

  it('moving one entity changes only its layout lines', () => {
    const before = notesErdText().split('\n');
    const after = stringifyErd(moveEntities(notesErd(), { note: { x: 360, y: 80 } })).split('\n');
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
    expect(changed).toHaveLength(2);
    // Both changed lines sit inside the "note" layout entry.
    const layoutStart = after.indexOf('  "layout": {');
    const noteEntry = after.indexOf('    "note": {', layoutStart);
    expect(changed.every((i) => i > noteEntry && i <= noteEntry + 2)).toBe(true);
  });
});
