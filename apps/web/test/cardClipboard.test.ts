import { describe, expect, it } from 'vitest';
import { parseDesign } from '@modelwright/schema';
import { decodeCards, encodeCards, pasteShift } from '../src/canvas/cardClipboard';
import { entityFragment, pasteEntities } from '../src/erd/ops';
import { pasteScreens, screenFragment } from '../src/flows/ops';
import { notesErd, notesFlows } from './fixtures';
import { deepFreeze } from './helpers';

const NONE = { x: 0, y: 0 };

describe('entity fragments and pasting', () => {
  it('lifts the entities, the relationships between them, and their places', () => {
    const erd = deepFreeze(notesErd());
    expect(entityFragment(erd, ['user', 'note']).relationships).toHaveLength(1);
    const one = entityFragment(erd, ['note']);
    expect(one.entities.map((e) => e.id)).toEqual(['note']);
    expect(one.relationships).toEqual([]);
    expect(one.layout).toEqual({ note: { x: 320, y: 0 } });
  });

  it('pastes copies with fresh ids, shifted, linked to each other, into a valid ERD', () => {
    const erd = deepFreeze(notesErd());
    const { erd: next, ids } = pasteEntities(erd, entityFragment(erd, ['user', 'note']), {
      x: 16,
      y: 16,
    });
    expect(ids).toHaveLength(2);
    expect(ids.some((id) => id === 'user' || id === 'note')).toBe(false);
    expect(next.entities.map((e) => e.name)).toEqual(['User', 'Note', 'User', 'Note']);
    const copied = next.relationships.filter((r) => ids.includes(r.from));
    expect(copied).toHaveLength(1);
    expect(ids).toContain(copied[0]?.to);
    expect(next.layout[ids[1] as string]).toEqual({ x: 336, y: 16 });
    const attributeIds = next.entities.flatMap((e) => e.attributes.map((a) => a.id));
    expect(new Set(attributeIds).size).toBe(attributeIds.length);
    expect(parseDesign('erd', next).ok).toBe(true);
  });
});

describe('screen fragments and pasting', () => {
  it('keeps only transitions between copied screens', () => {
    const flows = deepFreeze(notesFlows());
    expect(screenFragment(flows, ['notes', 'editor']).transitions).toHaveLength(3);
    expect(screenFragment(flows, ['login']).transitions).toEqual([]);
  });

  it('pastes copies with fresh ids and their own transitions, into a valid document', () => {
    const flows = deepFreeze(notesFlows());
    const { flows: next, ids } = pasteScreens(
      flows,
      screenFragment(flows, ['notes', 'editor']),
      NONE,
    );
    expect(ids).toHaveLength(2);
    const copied = next.transitions.filter((t) => ids.includes(t.from.screenId));
    expect(copied).toHaveLength(3);
    expect(copied.every((t) => ids.includes(t.to.screenId))).toBe(true);
    expect(parseDesign('flows', next).ok).toBe(true);
  });

  it('keeps entity references at home, and drops them in another project', () => {
    const flows = deepFreeze(notesFlows());
    const fragment = screenFragment(flows, ['notes']);
    const home = pasteScreens(flows, fragment, NONE);
    expect(home.flows.screens.find((s) => s.id === home.ids[0])?.entities).toEqual(['note']);
    const away = pasteScreens(flows, fragment, NONE, { keepEntities: false });
    expect(away.flows.screens.find((s) => s.id === away.ids[0])).not.toHaveProperty('entities');
  });
});

describe('clipboard text', () => {
  it('round-trips cards', () => {
    const cards = {
      kind: 'erd' as const,
      project: '/p/notes',
      fragment: entityFragment(notesErd(), ['user']),
    };
    expect(decodeCards(encodeCards(cards))).toEqual(cards);
  });

  it.each([
    'hello',
    '{}',
    '{"modelwright/cards": 2, "kind": "erd", "project": "/p", "fragment": {}}',
    '{"modelwright/cards": 1, "kind": "erd", "project": "/p", "fragment": {"layout": {}}}',
    '{"modelwright/cards": 1, "kind": "sql", "project": "/p", "fragment": {"layout": {}, "entities": [], "relationships": []}}',
  ])('ignores text that isn’t modelwright’s cards: %s', (text) => {
    expect(decodeCards(text)).toBeNull();
  });
});

describe('pasteShift', () => {
  const copied = { a: { x: 100, y: 100 }, b: { x: 400, y: 100 } };
  const view = { x: 0, y: 0, width: 1000, height: 800 };

  it('moves a paste in the same project one grid step, like Duplicate', () => {
    expect(pasteShift(copied, copied, true, view)).toEqual({ x: 16, y: 16 });
  });

  it('moves each further paste another step', () => {
    const existing = { ...copied, c: { x: 116, y: 116 }, d: { x: 132, y: 132 } };
    expect(pasteShift(copied, existing, true, view)).toEqual({ x: 48, y: 48 });
  });

  it('keeps cards in place in another project, unless something is exactly there', () => {
    expect(pasteShift(copied, {}, false, view)).toEqual({ x: 0, y: 0 });
    expect(pasteShift(copied, { z: { x: 100, y: 100 } }, false, view)).toEqual({ x: 16, y: 16 });
  });

  it('centres cards in the view when they would land outside it', () => {
    const far = { x: 5000, y: 5000, width: 1000, height: 800 };
    const shift = pasteShift(copied, {}, false, far);
    // The cards' corners span 100–400 × 100: centred on (5500, 5400).
    expect(shift).toEqual({ x: 5500 - 250, y: 5400 - 100 });
  });
});
