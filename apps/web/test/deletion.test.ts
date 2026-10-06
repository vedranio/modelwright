import { describe, expect, it } from 'vitest';
import { attributeDeletionSummary, deletionSummary } from '../src/erd/deletion';
import {
  ctaDeletionSummary,
  deletionSummary as flowsDeletionSummary,
  seesDeletionSummary,
  stateDeletionSummary,
} from '../src/flows/deletion';
import { addEntity, addRelationship } from '../src/erd/ops';
import { notesErd, notesFlows } from './fixtures';

const ids = (...xs: string[]) => new Set(xs);

describe('ERD deletion toast', () => {
  it('names a single entity with its attributes and relationships', () => {
    expect(deletionSummary(notesErd(), ids('user'), ids())).toBe(
      "Deleted 'User', 2 attributes and 1 relationship",
    );
  });

  it('counts several entities together, without double-counting a shared relationship', () => {
    expect(deletionSummary(notesErd(), ids('user', 'note'), ids('user-notes'))).toBe(
      'Deleted 2 entities, 5 attributes and 1 relationship',
    );
  });

  it('leaves out parts that are zero', () => {
    const { erd, id } = addEntity(notesErd(), { x: 0, y: 0 });
    expect(deletionSummary(erd, ids(id), ids())).toBe("Deleted 'Entity'");
    const related = addRelationship(erd, id, 'user').erd;
    expect(deletionSummary(related, ids(id), ids())).toBe("Deleted 'Entity' and 1 relationship");
  });

  it('names a lone relationship by its two ends', () => {
    expect(deletionSummary(notesErd(), ids(), ids('user-notes'))).toBe(
      "Deleted the relationship between 'User' and 'Note'",
    );
    const self = addRelationship(notesErd(), 'user', 'user');
    expect(deletionSummary(self.erd, ids(), ids(self.id ?? ''))).toBe(
      "Deleted the relationship from 'User' to itself",
    );
  });

  it('counts several relationships', () => {
    const two = addRelationship(notesErd(), 'note', 'user');
    expect(deletionSummary(two.erd, ids(), ids('user-notes', two.id ?? ''))).toBe(
      'Deleted 2 relationships',
    );
  });

  it('says nothing when nothing would go', () => {
    expect(deletionSummary(notesErd(), ids('gone'), ids('gone'))).toBeNull();
  });

  it('names a deleted attribute', () => {
    expect(attributeDeletionSummary(notesErd(), 'user', 'user-email')).toBe(
      "Deleted attribute 'email'",
    );
    expect(attributeDeletionSummary(notesErd(), 'user', 'gone')).toBeNull();
  });
});

describe('Flows deletion toast', () => {
  it('names a screen with every transition from or to it', () => {
    expect(flowsDeletionSummary(notesFlows(), ids('notes'), ids())).toBe(
      "Deleted 'Notes' and 4 transitions",
    );
    expect(flowsDeletionSummary(notesFlows(), ids('login'), ids())).toBe(
      "Deleted 'Login' and 1 transition",
    );
  });

  it('counts several screens together', () => {
    expect(flowsDeletionSummary(notesFlows(), ids('login', 'editor'), ids('t1'))).toBe(
      'Deleted 2 screens and 4 transitions',
    );
  });

  it('names a lone transition by its CTA and target', () => {
    expect(flowsDeletionSummary(notesFlows(), ids(), ids('t1'))).toBe(
      "Deleted the transition 'Sign in' → 'Notes'",
    );
    expect(flowsDeletionSummary(notesFlows(), ids(), ids('t1', 't2'))).toBe(
      'Deleted 2 transitions',
    );
  });

  it('names a state with the transitions leaving it', () => {
    expect(stateDeletionSummary(notesFlows(), 'notes', 'notes-empty')).toBe(
      "Deleted state 'Empty' and 1 transition",
    );
    expect(stateDeletionSummary(notesFlows(), 'login', 'login-error')).toBe(
      "Deleted state 'Error'",
    );
    // A screen's last state can't be deleted.
    expect(stateDeletionSummary(notesFlows(), 'editor', 'editor-default')).toBeNull();
  });

  it('names sees items and CTAs', () => {
    expect(seesDeletionSummary(notesFlows(), 'login', 'login-error', 2)).toBe(
      "Deleted 'error message'",
    );
    expect(ctaDeletionSummary(notesFlows(), 'editor', 'editor-back', 'x')).toBeNull();
    expect(ctaDeletionSummary(notesFlows(), 'editor', 'editor-default', 'editor-back')).toBe(
      "Deleted CTA 'Back' and 1 transition",
    );
    expect(ctaDeletionSummary(notesFlows(), 'editor', 'editor-default', 'editor-save')).toBe(
      "Deleted CTA 'Save'",
    );
  });
});
