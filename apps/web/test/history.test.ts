import { describe, expect, it } from 'vitest';
import {
  COALESCE_WINDOW_MS,
  HISTORY_CAP,
  emptyHistory,
  record,
  redo,
  undo,
} from '../src/editing/history';
import { must } from './helpers';

describe('history', () => {
  it('pushes, undoes and redoes', () => {
    let h = record(emptyHistory<string>(), 'a');
    h = record(h, 'b');
    const back = must(undo(h, 'c'));
    expect(back.doc).toBe('b');
    const back2 = must(undo(back.history, 'b'));
    expect(back2.doc).toBe('a');
    expect(undo(back2.history, 'a')).toBeNull();
    const fwd = must(redo(back2.history, 'a'));
    expect(fwd.doc).toBe('b');
    expect(must(redo(fwd.history, 'b')).doc).toBe('c');
  });

  it('clears the redo stack on a new step', () => {
    const h = record(emptyHistory<string>(), 'a');
    const back = must(undo(h, 'b'));
    expect(back.history.future).toEqual(['b']);
    expect(record(back.history, 'a').future).toEqual([]);
  });

  it(`keeps at most ${HISTORY_CAP} steps, dropping the oldest`, () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < HISTORY_CAP + 5; i++) h = record(h, i);
    expect(h.past).toHaveLength(HISTORY_CAP);
    expect(h.past[0]).toBe(5);
  });

  it('coalesces steps with the same key inside the window', () => {
    let h = record(emptyHistory<string>(), 'a', { key: 'nudge', now: 0 });
    h = record(h, 'b', { key: 'nudge', now: COALESCE_WINDOW_MS });
    h = record(h, 'c', { key: 'nudge', now: COALESCE_WINDOW_MS * 2 });
    expect(h.past).toEqual(['a']);
  });

  it('starts a new step after a pause, a different key or an unkeyed step', () => {
    let h = record(emptyHistory<string>(), 'a', { key: 'nudge', now: 0 });
    h = record(h, 'b', { key: 'nudge', now: COALESCE_WINDOW_MS + 1 });
    h = record(h, 'c', { key: 'other', now: COALESCE_WINDOW_MS + 2 });
    h = record(h, 'd');
    h = record(h, 'e', { key: 'other', now: COALESCE_WINDOW_MS + 3 });
    expect(h.past).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('never coalesces across an undo', () => {
    const h = record(emptyHistory<string>(), 'a', { key: 'nudge', now: 0 });
    const back = must(undo(h, 'b'));
    const again = record(back.history, 'a', { key: 'nudge', now: 1 });
    expect(again.past).toEqual(['a']);
  });
});
