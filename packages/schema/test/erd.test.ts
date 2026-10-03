import { describe, expect, it } from 'vitest';
import { parseErd } from '../src/index';
import { expectIssue, fixture, issuesOf } from './helpers';

describe('erd.json', () => {
  it('parses the notes fixture', () => {
    const result = parseErd(fixture('erd'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.entities.map((e) => e.name)).toEqual(['User', 'Note']);
      expect(result.doc.relationships).toHaveLength(1);
    }
  });

  it('rejects a relationship pointing at a missing entity', () => {
    const erd = fixture('erd');
    erd.relationships[0].to = 'ghost';
    expectIssue(parseErd(erd), ['relationships', 0, 'to'], /unknown entity "ghost"/);
  });

  it('checks the from end of a relationship too', () => {
    const erd = fixture('erd');
    erd.relationships[0].from = 'ghost';
    expectIssue(parseErd(erd), ['relationships', 0, 'from'], /unknown entity "ghost"/);
  });

  it('rejects a layout key that is not an entity', () => {
    const erd = fixture('erd');
    erd.layout.ghost = { x: 1, y: 2 };
    expectIssue(parseErd(erd), ['layout', 'ghost'], /unknown entity "ghost"/);
  });

  it('allows an entity without a layout entry', () => {
    const erd = fixture('erd');
    delete erd.layout.note;
    expect(parseErd(erd).ok).toBe(true);
  });

  it('rejects duplicate entity ids', () => {
    const erd = fixture('erd');
    erd.entities[1].id = 'user';
    expectIssue(parseErd(erd), ['entities', 1, 'id'], /Duplicate entity id "user"/);
  });

  it('rejects duplicate relationship ids', () => {
    const erd = fixture('erd');
    erd.relationships.push({ ...erd.relationships[0] });
    expectIssue(parseErd(erd), ['relationships', 1, 'id'], /Duplicate relationship id/);
  });

  it('rejects duplicate attribute ids within an entity', () => {
    const erd = fixture('erd');
    erd.entities[1].attributes[2].id = 'note-title';
    expectIssue(parseErd(erd), ['entities', 1, 'attributes', 2, 'id'], /Duplicate attribute id/);
  });

  it('allows the same attribute id in different entities', () => {
    const erd = fixture('erd');
    erd.entities[0].attributes[0].id = 'shared';
    erd.entities[1].attributes[0].id = 'shared';
    expect(parseErd(erd).ok).toBe(true);
  });

  it('rejects an unknown cardinality', () => {
    const erd = fixture('erd');
    erd.relationships[0].toCard = 'lots';
    expectIssue(parseErd(erd), ['relationships', 0, 'toCard']);
  });

  it('rejects an empty id', () => {
    const erd = fixture('erd');
    erd.entities[0].attributes[0].id = '';
    expectIssue(parseErd(erd), ['entities', 0, 'attributes', 0, 'id'], /non-empty/);
  });

  it('rejects an unknown key, pointing at the key', () => {
    const erd = fixture('erd');
    erd.entities[0].desciption = 'typo';
    expectIssue(parseErd(erd), ['entities', 0, 'desciption'], /Unknown key "desciption"/);
  });

  it('reports every problem, not just the first', () => {
    const erd = fixture('erd');
    erd.relationships[0].from = 'ghost-a';
    erd.relationships[0].to = 'ghost-b';
    expect(issuesOf(parseErd(erd))).toHaveLength(2);
  });
});
