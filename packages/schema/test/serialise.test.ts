import { describe, expect, it } from 'vitest';
import {
  DESIGN_KINDS,
  defaultConfig,
  defaultErd,
  defaultFlows,
  parseConfig,
  parseDesign,
  parseDesignJson,
  parseErd,
  parseFlows,
  stringifyConfig,
  stringifyDesign,
  stringifyErd,
} from '../src/index';
import { expectIssue, fixtureText } from './helpers';

function parseOk<K extends (typeof DESIGN_KINDS)[number]>(kind: K, text: string) {
  const result = parseDesignJson(kind, text);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.doc;
}

describe('stringify', () => {
  it.each(DESIGN_KINDS)('re-saves an untouched %s fixture byte for byte', (kind) => {
    const text = fixtureText(kind);
    expect(stringifyDesign(kind, parseOk(kind, text))).toBe(text);
  });

  it.each(DESIGN_KINDS)('is stable across parse → stringify → parse for %s', (kind) => {
    const once = stringifyDesign(kind, parseOk(kind, fixtureText(kind)));
    const doc = parseOk(kind, once);
    expect(stringifyDesign(kind, doc)).toBe(once);
    expect(doc).toEqual(parseOk(kind, fixtureText(kind)));
  });

  it('writes keys in schema order whatever order they arrive in', () => {
    const scrambled = {
      layout: { note: { y: 0, x: 320 }, user: { y: 0, x: 0 } },
      relationships: [
        {
          label: 'owns',
          toCard: 'zero-many',
          fromCard: 'one',
          to: 'note',
          from: 'user',
          id: 'user-notes',
        },
      ],
      entities: [
        {
          attributes: [
            { name: 'email', id: 'user-email' },
            { name: 'display name', id: 'user-name' },
          ],
          name: 'User',
          id: 'user',
        },
        {
          attributes: [
            { name: 'title', id: 'note-title' },
            { name: 'body', id: 'note-body' },
            { note: 'set on every save', name: 'updated at', id: 'note-updated' },
          ],
          name: 'Note',
          id: 'note',
        },
      ],
      schemaVersion: 1,
    };
    const result = parseErd(scrambled);
    expect(result.ok && stringifyErd(result.doc)).toBe(fixtureText('erd'));
  });

  it('orders layout entries by node order', () => {
    const result = parseFlows({
      schemaVersion: 1,
      screens: [
        { id: 'b', name: 'B', states: [{ id: 's', name: 'S', sees: [], ctas: [] }] },
        { id: 'a', name: 'A', states: [{ id: 's', name: 'S', sees: [], ctas: [] }] },
      ],
      transitions: [],
      layout: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } },
    });
    if (!result.ok) throw new Error('fixture invalid');
    const layout = JSON.parse(stringifyDesign('flows', result.doc)).layout;
    expect(Object.keys(layout)).toEqual(['b', 'a']);
  });

  it('changes only the edited value when a field changes', () => {
    const doc = parseOk('config', fixtureText('config'));
    const edited = stringifyConfig({ ...doc, name: 'Notebook' });
    expect(edited).toBe(fixtureText('config').replace('"Notes"', '"Notebook"'));
  });

  it('omits optional fields that are undefined', () => {
    expect(stringifyConfig({ schemaVersion: 1, name: 'X', preview: { url: undefined } })).toBe(
      '{\n  "schemaVersion": 1,\n  "name": "X",\n  "preview": {}\n}\n',
    );
  });
});

describe('parseDesignJson', () => {
  it('reports invalid JSON at the root path', () => {
    expectIssue(parseDesignJson('erd', '{ "schemaVersion": 1,'), [], /Invalid JSON/);
  });

  it('names the file in the error', () => {
    const result = parseDesignJson('flows', 'nope');
    expect(!result.ok && result.error.file).toBe('flows');
  });
});

describe('defaults', () => {
  it('defaultErd is a valid empty ERD', () => {
    expect(parseErd(defaultErd())).toEqual({
      ok: true,
      doc: { schemaVersion: 1, entities: [], relationships: [], layout: {} },
    });
  });

  it('defaultFlows is a valid empty flow chart', () => {
    expect(parseFlows(defaultFlows())).toEqual({
      ok: true,
      doc: { schemaVersion: 1, screens: [], transitions: [], layout: {} },
    });
  });

  it('defaultConfig is valid and carries the name', () => {
    const result = parseConfig(defaultConfig('My app'));
    expect(result.ok && result.doc).toEqual({ schemaVersion: 1, name: 'My app', preview: {} });
  });

  it('returns a fresh object each time', () => {
    const a = defaultErd();
    a.entities.push({ id: 'x', name: 'X', attributes: [] });
    expect(defaultErd().entities).toEqual([]);
  });

  it.each(DESIGN_KINDS)('the %s default survives a stringify round trip', (kind) => {
    const doc =
      kind === 'config' ? defaultConfig('X') : kind === 'erd' ? defaultErd() : defaultFlows();
    const text = stringifyDesign(kind, doc as never);
    expect(parseDesign(kind, JSON.parse(text)).ok).toBe(true);
  });
});
