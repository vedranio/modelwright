import { describe, expect, it } from 'vitest';
import { newId } from '../src/editing/ids';
import { idsIn } from '../src/erd/ids';
import { notesErd } from './fixtures';

describe('newId', () => {
  it.each(['ent', 'attr', 'rel'] as const)(
    'makes %s_ ids with 8 lowercase alphanumerics',
    (prefix) => {
      expect(newId(prefix, new Set())).toMatch(new RegExp(`^${prefix}_[0-9a-z]{8}$`));
    },
  );

  it.each(['scr', 'st', 'cta', 'tr'] as const)('makes flow %s_ ids in the same shape', (prefix) => {
    expect(newId(prefix, new Set())).toMatch(new RegExp(`^${prefix}_[0-9a-z]{8}$`));
  });

  it('is deterministic for a given random source', () => {
    expect(newId('scr', new Set(), () => 'abcd1234')).toBe('scr_abcd1234');
  });

  it('retries until the id is not already taken', () => {
    const sequence = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'];
    const random = () => sequence.shift() ?? 'zzzzzzzz';
    const existing = new Set(['ent_aaaaaaaa', 'ent_bbbbbbbb']);
    expect(newId('ent', existing, random)).toBe('ent_cccccccc');
  });

  it('produces distinct ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newId('attr', ids));
    expect(ids.size).toBe(1000);
  });
});

describe('idsIn', () => {
  it('collects entity, attribute and relationship ids', () => {
    expect([...idsIn(notesErd())].sort()).toEqual(
      [
        'note',
        'note-body',
        'note-title',
        'note-updated',
        'user',
        'user-email',
        'user-name',
        'user-notes',
      ].sort(),
    );
  });
});
