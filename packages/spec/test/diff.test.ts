import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDesignJson, type DesignKind } from '@modelwright/schema';
import { changeCount, diffDesign, renderDiff, type ChangeKind, type Design } from '../src';
import { alignText, mergedOrder } from '../src/diff';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const NOTES = here('../../schema/test/fixtures/notes');
const EDITED = here('./fixtures/notes-edited');

function load(dir: string): Design {
  const read = <K extends DesignKind>(kind: K) => {
    const result = parseDesignJson(kind, readFileSync(`${dir}/${kind}.json`, 'utf8'));
    if (!result.ok) throw new Error(`${dir}/${kind}.json: ${JSON.stringify(result.error)}`);
    return result.doc;
  };
  return { config: read('config'), erd: read('erd'), flows: read('flows') } as Design;
}

/** A mutable copy of the notes design. */
function notes(): Design {
  return structuredClone(load(NOTES));
}

/** Diffs the notes design against a copy changed by `edit`. */
function diffAfter(edit: (d: Design) => void) {
  const before = notes();
  const after = notes();
  edit(after);
  return diffDesign(before, after);
}

function all(edit: (d: Design) => void) {
  const diff = diffAfter(edit);
  return [...diff.dataModel, ...diff.screens, ...diff.config];
}

function only(edit: (d: Design) => void, kind: ChangeKind) {
  const changes = all(edit);
  expect(changes.map((c) => c.kind)).toEqual([kind]);
  return need(changes[0]);
}

/** `value`, which the test knows is there. */
function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value');
  return value;
}

const entity = (d: Design, id: string) => need(d.erd.entities.find((e) => e.id === id));
const screen = (d: Design, id: string) => need(d.flows.screens.find((s) => s.id === id));
const state = (d: Design, screenId: string, id: string) =>
  need(screen(d, screenId).states.find((s) => s.id === id));

/** Compares with the checked-in golden file; `UPDATE_GOLDEN=1` rewrites it. */
function golden(name: string, text: string) {
  const file = here(`./golden/${name}.md`);
  if (process.env.UPDATE_GOLDEN || !existsSync(file)) writeFileSync(file, text);
  expect(text).toBe(readFileSync(file, 'utf8'));
}

describe('diffDesign: the notes example', () => {
  it('matches the golden Markdown for an edit touching every category', () => {
    golden('notes-diff', renderDiff(diffDesign(load(NOTES), load(EDITED))));
  });

  it('is empty for identical designs', () => {
    const diff = diffDesign(notes(), notes());
    expect(changeCount(diff)).toBe(0);
    expect(renderDiff(diff)).toBe('No changes.\n');
  });

  it('is deterministic', () => {
    const a = diffDesign(load(NOTES), load(EDITED));
    const b = diffDesign(load(NOTES), load(EDITED));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('diffDesign: layout', () => {
  it('ignores moving cards on either canvas', () => {
    const diff = diffAfter((d) => {
      d.erd.layout = { note: { x: 999, y: -5 } };
      d.flows.layout = { editor: { x: 1, y: 2 }, login: { x: 3, y: 4 } };
    });
    expect(changeCount(diff)).toBe(0);
  });
});

describe('diffDesign: data model', () => {
  it('reports an added entity with its attributes', () => {
    const c = only((d) => {
      d.erd.entities.push({
        id: 'tag',
        name: 'Tag',
        description: 'A label',
        attributes: [{ id: 'tag-name', name: 'name' }],
      });
    }, 'entity-added');
    expect(c.ids).toEqual({ entityId: 'tag' });
    expect(c.text).toBe('Added entity “Tag”, described as “A label”, with attribute “name”.');
  });

  it('reports a removed entity, with its relationship', () => {
    const changes = all((d) => {
      d.erd.entities = d.erd.entities.filter((e) => e.id !== 'note');
      d.erd.relationships = [];
      d.erd.layout = { user: { x: 0, y: 0 } };
      screen(d, 'notes').entities = [];
      screen(d, 'editor').entities = [];
    });
    expect(changes.map((c) => c.kind)).toEqual([
      'entity-removed',
      'relationship-removed',
      'screen-entities-changed',
      'screen-entities-changed',
    ]);
    expect(changes[0]?.text).toBe('Removed entity “Note”.');
    expect(changes[1]?.text).toBe(
      'Removed a relationship: Each User owns zero or more Notes. Each Note belongs to exactly one User.',
    );
    expect(changes[2]?.text).toBe('Screen “Notes” no longer uses “Note”.');
  });

  it('reports a rename as a rename, by id', () => {
    const c = only((d) => {
      entity(d, 'note').name = 'Memo';
    }, 'entity-renamed');
    expect(c).toEqual({
      kind: 'entity-renamed',
      ids: { entityId: 'note' },
      text: 'Renamed entity “Note” to “Memo”.',
    });
  });

  it('reports description changes', () => {
    expect(
      only((d) => (entity(d, 'user').description = 'Signs in'), 'entity-description-changed').text,
    ).toBe('Added a description to “User”: “Signs in”.');
  });

  it('reports attribute additions, removals, renames, notes and reordering', () => {
    expect(
      only(
        (d) => entity(d, 'user').attributes.push({ id: 'user-age', name: 'age' }),
        'attribute-added',
      ),
    ).toEqual({
      kind: 'attribute-added',
      ids: { entityId: 'user', attributeId: 'user-age' },
      text: 'Added attribute “age” to “User”.',
    });
    expect(
      only(
        (d) => (entity(d, 'user').attributes = entity(d, 'user').attributes.slice(1)),
        'attribute-removed',
      ).text,
    ).toBe('Removed attribute “email” from “User”.');
    expect(
      only((d) => (need(entity(d, 'note').attributes[0]).name = 'heading'), 'attribute-renamed')
        .text,
    ).toBe('Renamed attribute “title” of “Note” to “heading”.');
    expect(
      only((d) => delete need(entity(d, 'note').attributes[2]).note, 'attribute-note-changed').text,
    ).toBe('Removed the note on attribute “updated at” of “Note”.');
    expect(only((d) => entity(d, 'note').attributes.reverse(), 'attributes-reordered').text).toBe(
      'Reordered the attributes of “Note”: “updated at”, “body” and “title”.',
    );
  });

  it('describes cardinality changes in sentence wording', () => {
    const c = only((d) => {
      need(d.erd.relationships[0]).toCard = 'many';
      need(d.erd.relationships[0]).fromCard = 'zero-one';
    }, 'relationship-cardinality-changed');
    expect(c.ids).toEqual({ relationshipId: 'user-notes' });
    expect(c.text).toBe(
      'Each User now owns one or more Notes (was zero or more). Each Note now belongs to zero or one User (was exactly one).',
    );
  });

  it('reports label changes, additions and reversals', () => {
    expect(
      only((d) => (need(d.erd.relationships[0]).label = 'writes'), 'relationship-label-changed')
        .text,
    ).toBe('The relationship from “User” to “Note” is now labelled “writes” (was “owns”).');
    expect(
      only(
        (d) =>
          d.erd.relationships.push({
            id: 'r2',
            from: 'note',
            to: 'user',
            fromCard: 'zero-many',
            toCard: 'one',
          }),
        'relationship-added',
      ).text,
    ).toBe(
      'Added a relationship: Each Note has exactly one User. Each User belongs to zero or more Notes.',
    );

    const reversed = only((d) => {
      const r = need(d.erd.relationships[0]);
      d.erd.relationships[0] = {
        ...r,
        from: r.to,
        to: r.from,
        fromCard: r.toCard,
        toCard: r.fromCard,
      };
    }, 'relationship-reversed');
    expect(reversed.text).toBe(
      'Reversed the relationship between “User” and “Note”. It now reads: Each Note owns exactly one User. Each User belongs to zero or more Notes.',
    );
  });
});

describe('diffDesign: relationship reconnection', () => {
  it('reports a relationship whose ends changed', () => {
    const before = notes();
    before.erd.entities.push({ id: 'tag', name: 'Tag', attributes: [] });
    const after = structuredClone(before);
    need(after.erd.relationships[0]).to = 'tag';
    const diff = diffDesign(before, after);
    expect(diff.dataModel.map((c) => c.kind)).toEqual(['relationship-reconnected']);
    expect(diff.dataModel[0]?.text).toBe(
      'The relationship between “User” and “Note” now joins “User” and “Tag”. It now reads: Each User owns zero or more Tags. Each Tag belongs to exactly one User.',
    );
  });
});

describe('diffDesign: screens and flows', () => {
  it('reports added, removed and renamed screens', () => {
    expect(
      only(
        (d) =>
          d.flows.screens.push({
            id: 'tags',
            name: 'Tags',
            states: [
              { id: 'a', name: 'List', sees: [], ctas: [] },
              { id: 'b', name: 'Empty', sees: [], ctas: [] },
            ],
          }),
        'screen-added',
      ).text,
    ).toBe('Added screen “Tags”, with states “List” and “Empty”.');

    const removed = all((d) => {
      d.flows.screens = d.flows.screens.filter((s) => s.id !== 'editor');
      d.flows.transitions = d.flows.transitions.filter(
        (t) => t.from.screenId !== 'editor' && t.to.screenId !== 'editor',
      );
      delete d.flows.layout['editor'];
    });
    // Transitions into or out of a removed screen go with it; the CTAs that led there are now dead ends.
    expect(removed.map((c) => c.kind)).toEqual([
      'cta-now-dead-end',
      'cta-now-dead-end',
      'screen-removed',
    ]);
    expect(removed[0]?.text).toBe('Action “New note” in “Notes › List” is now a dead end.');
    expect(removed[2]?.text).toBe('Removed screen “Note editor”.');

    expect(only((d) => (screen(d, 'notes').name = 'Memos'), 'screen-renamed').text).toBe(
      'Renamed screen “Notes” to “Memos”.',
    );
  });

  it('reports notes and entities cross-reference changes', () => {
    expect(
      only((d) => (screen(d, 'login').notes = 'First screen'), 'screen-notes-changed').text,
    ).toBe('Added notes to “Login”: “First screen”.');
    expect(
      only((d) => (screen(d, 'login').entities = ['user']), 'screen-entities-changed'),
    ).toEqual({
      kind: 'screen-entities-changed',
      ids: { screenId: 'login' },
      text: 'Screen “Login” now uses “User”.',
    });
  });

  it('reports states added, removed, renamed, reordered and a new default', () => {
    expect(
      only(
        (d) =>
          screen(d, 'editor').states.push({
            id: 'editor-saving',
            name: 'Saving',
            sees: [],
            ctas: [],
          }),
        'state-added',
      ),
    ).toEqual({
      kind: 'state-added',
      ids: { screenId: 'editor', stateId: 'editor-saving' },
      text: 'Added state “Saving” to “Note editor”.',
    });
    expect(
      only((d) => {
        screen(d, 'login').states.pop();
        d.flows.transitions = d.flows.transitions.filter((t) => t.from.stateId !== 'login-error');
      }, 'state-removed').text,
    ).toBe('Removed state “Error” from “Login”.');
    expect(
      only((d) => (state(d, 'login', 'login-error').name = 'Failed'), 'state-renamed').text,
    ).toBe('Renamed state “Error” of “Login” to “Failed”.');

    const swapped = all((d) => screen(d, 'notes').states.reverse());
    expect(swapped.map((c) => c.kind)).toEqual(['default-state-changed', 'states-reordered']);
    expect(swapped[0]?.text).toBe('“Notes” now opens in state “Empty” (was “List”).');
    expect(swapped[0]?.ids).toEqual({ screenId: 'notes', stateId: 'notes-empty' });
  });

  it('aligns information items by text, pairing leftovers as changes', () => {
    const changes = all((d) => {
      state(d, 'notes', 'notes-list').sees = ['note titles', 'tags', 'last edited', 'search'];
    });
    expect(changes.map((c) => [c.kind, c.text])).toEqual([
      ['information-changed', 'Changed information “updated dates” in “Notes › List” to “tags”.'],
      ['information-added', 'Added information “last edited” to “Notes › List”.'],
      ['information-added', 'Added information “search” to “Notes › List”.'],
    ]);
    expect(changes[0]?.ids).toEqual({ screenId: 'notes', stateId: 'notes-list' });
    const removed = all((d) => (state(d, 'login', 'login-error').sees = ['email field']));
    expect(removed.map((c) => c.text)).toEqual([
      'Removed information “password field” from “Login › Error”.',
      'Removed information “error message” from “Login › Error”.',
    ]);
  });

  it('reports CTAs added, removed, renamed and reordered', () => {
    expect(
      only(
        (d) => state(d, 'editor', 'editor-default').ctas.push({ id: 'x', label: 'Share' }),
        'cta-added',
      ).text,
    ).toBe('Added action “Share” to “Note editor” (dead end).');
    expect(
      only(
        (d) =>
          (state(d, 'editor', 'editor-default').ctas = state(
            d,
            'editor',
            'editor-default',
          ).ctas.slice(1)),
        'cta-removed',
      ),
    ).toEqual({
      kind: 'cta-removed',
      ids: { screenId: 'editor', stateId: 'editor-default', ctaId: 'editor-save' },
      text: 'Removed action “Save” from “Note editor”.',
    });
    expect(
      only(
        (d) => (need(state(d, 'login', 'login-default').ctas[0]).label = 'Log in'),
        'cta-renamed',
      ).text,
    ).toBe('Renamed action “Sign in” in “Login › Default” to “Log in”.');
    expect(only((d) => state(d, 'notes', 'notes-list').ctas.reverse(), 'ctas-reordered').text).toBe(
      'Reordered the actions in “Notes › List”: “Open note” and “New note”.',
    );
  });

  it('folds a deleted CTA’s transition into its removal', () => {
    const changes = all((d) => {
      state(d, 'editor', 'editor-default').ctas.pop();
      d.flows.transitions = d.flows.transitions.filter((t) => t.id !== 't4');
    });
    expect(changes.map((c) => c.kind)).toEqual(['cta-removed']);
  });

  it('reports transitions added, removed, retargeted, moved and relabelled', () => {
    const added = all((d) =>
      d.flows.transitions.push({
        id: 't5',
        from: { screenId: 'notes', stateId: 'notes-list', ctaId: 'notes-open' },
        to: { screenId: 'editor' },
        label: 'existing note',
      }),
    );
    expect(added.map((c) => [c.kind, c.text])).toEqual([
      [
        'cta-no-longer-dead-end',
        'Action “Open note” in “Notes › List” is no longer a dead end: it leads to “Note editor”.',
      ],
      [
        'transition-added',
        'Added a transition: “Open note” in “Notes › List” → “Note editor”, labelled “existing note”.',
      ],
    ]);
    expect(added[1]?.ids).toEqual({
      transitionId: 't5',
      screenId: 'notes',
      stateId: 'notes-list',
      ctaId: 'notes-open',
    });

    const removed = all(
      (d) => (d.flows.transitions = d.flows.transitions.filter((t) => t.id !== 't1')),
    );
    expect(removed.map((c) => [c.kind, c.text])).toEqual([
      ['cta-now-dead-end', 'Action “Sign in” in “Login › Default” is now a dead end.'],
      ['transition-removed', 'Removed the transition “Sign in” in “Login › Default” → “Notes”.'],
    ]);

    expect(
      only(
        (d) => (need(d.flows.transitions[3]).to = { screenId: 'notes', stateId: 'notes-empty' }),
        'transition-retargeted',
      ).text,
    ).toBe('“Back” in “Note editor” now leads to “Notes › Empty” (was “Notes › List”).');

    const moved = all(
      (d) =>
        (need(d.flows.transitions[0]).from = {
          screenId: 'login',
          stateId: 'login-error',
          ctaId: 'login-retry',
        }),
    );
    expect(moved.map((c) => c.kind)).toEqual([
      'cta-now-dead-end',
      'cta-no-longer-dead-end',
      'transition-moved',
    ]);
    expect(moved[2]?.text).toBe(
      'The transition to “Notes” now starts from “Try again” in “Login › Error” (was “Sign in” in “Login › Default”).',
    );

    expect(
      only((d) => (need(d.flows.transitions[0]).label = 'success'), 'transition-label-changed')
        .text,
    ).toBe('The transition “Sign in” in “Login › Default” → “Notes” is now labelled “success”.');
  });
});

describe('diffDesign: state notes and primary CTA', () => {
  it('reports state notes added, changed and removed', () => {
    expect(
      only((d) => (state(d, 'notes', 'notes-empty').notes = 'No notes yet'), 'state-notes-changed'),
    ).toEqual({
      kind: 'state-notes-changed',
      ids: { screenId: 'notes', stateId: 'notes-empty' },
      text: 'Added notes to “Notes › Empty”: “No notes yet”.',
    });
  });

  it('reports a new, moved or cleared primary CTA', () => {
    const marked = only(
      (d) => (state(d, 'notes', 'notes-list').primaryCtaId = 'notes-new'),
      'primary-cta-changed',
    );
    expect(marked).toEqual({
      kind: 'primary-cta-changed',
      ids: { screenId: 'notes', stateId: 'notes-list', ctaId: 'notes-new' },
      text: '“New note” is now the primary action in “Notes › List”.',
    });

    const before = notes();
    state(before, 'notes', 'notes-list').primaryCtaId = 'notes-new';
    const after = structuredClone(before);
    delete state(after, 'notes', 'notes-list').primaryCtaId;
    expect(diffDesign(before, after).screens.map((c) => c.text)).toEqual([
      '“Notes › List” no longer has a primary action (was “New note”).',
    ]);
  });
});

describe('diffDesign: config', () => {
  it('reports a renamed project and a changed preview URL', () => {
    const changes = all((d) => {
      d.config.name = 'Memos';
      d.config.preview.url = 'http://localhost:3000';
      d.config.preview.devCommand = 'pnpm dev';
    });
    expect(changes.map((c) => c.text)).toEqual([
      'Renamed the project “Notes” to “Memos”.',
      'Changed the preview URL to http://localhost:3000 (was http://localhost:5173).',
    ]);
  });
});

describe('helpers', () => {
  it('mergedOrder keeps removed ids where they were', () => {
    expect(mergedOrder(['a', 'b', 'c', 'd'], ['x', 'a', 'c'])).toEqual(['x', 'a', 'b', 'c', 'd']);
    expect(mergedOrder(['a', 'b'], [])).toEqual(['a', 'b']);
    expect(mergedOrder(['z'], ['a'])).toEqual(['z', 'a']);
  });

  it('alignText matches equal items and pairs the rest', () => {
    expect(alignText(['a', 'b', 'c'], ['a', 'c'])).toEqual([{ op: 'removed', was: 'b' }]);
    expect(alignText(['a'], ['b', 'c'])).toEqual([
      { op: 'changed', was: 'a', now: 'b' },
      { op: 'added', now: 'c' },
    ]);
    expect(alignText(['a', 'b'], ['b', 'a'])).toHaveLength(2);
  });
});
