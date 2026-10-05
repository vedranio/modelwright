import { describe, expect, it } from 'vitest';
import { parseDesignJson, stringifyFlows, type Flows } from '@modelwright/schema';
import {
  addCta,
  addScreen,
  addState,
  addTransition,
  deleteState,
  makeDefaultState,
  moveScreens,
  renameCta,
  updateTransition,
} from '../src/flows/ops';
import { notesFlows, notesFlowsText } from './fixtures';

function reparse(flows: Flows): Flows {
  const result = parseDesignJson('flows', stringifyFlows(flows));
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

describe('flows round trip', () => {
  it('the untouched fixture stringifies to its own text', () => {
    expect(stringifyFlows(notesFlows())).toBe(notesFlowsText());
  });

  it.each([
    ['addScreen', (f: Flows) => addScreen(f, { x: 40, y: 400 }).flows],
    ['addState', (f: Flows) => addState(f, 'editor').flows],
    ['addCta', (f: Flows) => addCta(f, 'editor', 'editor-default', undefined, 'Delete').flows],
    [
      'addTransition',
      (f: Flows) =>
        addTransition(
          f,
          { screenId: 'login', stateId: 'login-error', ctaId: 'login-retry' },
          { screenId: 'login', stateId: 'login-default' },
        ).flows,
    ],
    [
      'updateTransition',
      (f: Flows) => updateTransition(f, 't1', { label: 'success', stateId: 'notes-empty' }),
    ],
    ['deleteState', (f: Flows) => deleteState(f, 'notes', 'notes-empty')],
    ['makeDefaultState', (f: Flows) => makeDefaultState(f, 'login', 'login-error')],
    ['moveScreens', (f: Flows) => moveScreens(f, { editor: { x: 700, y: 40 } })],
  ])('%s survives stringify and parse unchanged', (_name, op) => {
    const edited = op(notesFlows());
    expect(reparse(edited)).toEqual(edited);
  });

  it('renaming one CTA changes exactly one line', () => {
    const text = stringifyFlows(
      renameCta(notesFlows(), 'notes', 'notes-list', 'notes-open', 'Open'),
    );
    expect(changedLines(notesFlowsText(), text)).toBe(1);
    expect(text).toContain('"label": "Open"');
  });

  it('moving one screen changes only its layout entry', () => {
    const text = stringifyFlows(moveScreens(notesFlows(), { notes: { x: 400, y: 20 } }));
    expect(changedLines(notesFlowsText(), text)).toBe(2);
  });
});
