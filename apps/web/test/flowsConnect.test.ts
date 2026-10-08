import { describe, expect, it } from 'vitest';
import { ctaForHandle, dropTarget } from '../src/flows/connect';
import { ctaHandle } from '../src/flows/endpoints';
import { notesFlows } from './fixtures';

const signIn = { screenId: 'login', stateId: 'login-default', ctaId: 'login-submit' };
const tryAgain = { screenId: 'login', stateId: 'login-error', ctaId: 'login-retry' };

describe('ctaForHandle', () => {
  it('finds the CTA behind a source handle', () => {
    const f = notesFlows();
    expect(ctaForHandle(f, 'login', ctaHandle('login-error', 'login-retry'))).toEqual(tryAgain);
    expect(ctaForHandle(f, 'login', 'nope')).toBeNull();
    expect(ctaForHandle(f, 'gone', ctaHandle('login-error', 'login-retry'))).toBeNull();
  });
});

describe('dropTarget', () => {
  const f = notesFlows();

  it('targets a state when dropped on its header', () => {
    expect(dropTarget(f, signIn, { screenId: 'notes', stateId: 'notes-empty' })).toEqual({
      screenId: 'notes',
      stateId: 'notes-empty',
    });
  });

  it('targets the default state when dropped elsewhere on a card', () => {
    expect(dropTarget(f, signIn, { screenId: 'notes', stateId: null })).toEqual({
      screenId: 'notes',
    });
  });

  it('does nothing on empty canvas', () => {
    expect(dropTarget(f, signIn, { screenId: null, stateId: null })).toBeNull();
  });

  it('does nothing on the CTA’s own state header', () => {
    expect(dropTarget(f, tryAgain, { screenId: 'login', stateId: 'login-error' })).toBeNull();
  });

  it('does nothing elsewhere on its own card when the CTA is in the default state', () => {
    expect(dropTarget(f, signIn, { screenId: 'login', stateId: null })).toBeNull();
  });

  it('allows another state of its own screen', () => {
    expect(dropTarget(f, signIn, { screenId: 'login', stateId: 'login-error' })).toEqual({
      screenId: 'login',
      stateId: 'login-error',
    });
    expect(dropTarget(f, tryAgain, { screenId: 'login', stateId: null })).toEqual({
      screenId: 'login',
    });
  });

  it('targets a state when dropped anywhere in it, not just its header', () => {
    // The drop's stateId comes from the state section under the pointer: header or body.
    const fromDefault = { screenId: 'notes', stateId: 'notes-list', ctaId: 'notes-new' };
    expect(dropTarget(f, fromDefault, { screenId: 'notes', stateId: 'notes-empty' })).toEqual({
      screenId: 'notes',
      stateId: 'notes-empty',
    });
  });

  it('targets the default state anywhere on a single-state card', () => {
    expect(dropTarget(f, signIn, { screenId: 'editor', stateId: 'editor-default' })).toEqual({
      screenId: 'editor',
    });
  });

  it('does nothing anywhere on a single-state card from its own CTA', () => {
    const save = { screenId: 'editor', stateId: 'editor-default', ctaId: 'editor-save' };
    expect(dropTarget(f, save, { screenId: 'editor', stateId: 'editor-default' })).toBeNull();
    expect(dropTarget(f, save, { screenId: 'editor', stateId: null })).toBeNull();
  });
});
