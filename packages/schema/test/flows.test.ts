import { describe, expect, it } from 'vitest';
import { parseFlows } from '../src/index';
import { expectIssue, fixture } from './helpers';

describe('flows.json', () => {
  it('parses the notes fixture', () => {
    const result = parseFlows(fixture('flows'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.screens.map((s) => s.name)).toEqual(['Login', 'Notes', 'Note editor']);
      expect(result.doc.transitions).toHaveLength(4);
    }
  });

  it('rejects a screen with no states', () => {
    const flows = fixture('flows');
    flows.screens[0].states = [];
    flows.transitions = flows.transitions.filter(
      (t: { from: { screenId: string } }) => t.from.screenId !== 'login',
    );
    expectIssue(parseFlows(flows), ['screens', 0, 'states'], /at least one state/);
  });

  describe('transition from', () => {
    it('rejects an unknown screen', () => {
      const flows = fixture('flows');
      flows.transitions[0].from.screenId = 'ghost';
      expectIssue(parseFlows(flows), ['transitions', 0, 'from', 'screenId'], /unknown screen/);
    });

    it('rejects a state that is not on that screen', () => {
      const flows = fixture('flows');
      flows.transitions[0].from.stateId = 'notes-list';
      expectIssue(parseFlows(flows), ['transitions', 0, 'from', 'stateId'], /unknown state/);
    });

    it('rejects a CTA that is not on that state', () => {
      const flows = fixture('flows');
      flows.transitions[0].from.ctaId = 'login-retry';
      expectIssue(parseFlows(flows), ['transitions', 0, 'from', 'ctaId'], /unknown CTA/);
    });
  });

  describe('transition to', () => {
    it('rejects an unknown screen', () => {
      const flows = fixture('flows');
      flows.transitions[1].to.screenId = 'ghost';
      expectIssue(parseFlows(flows), ['transitions', 1, 'to', 'screenId'], /unknown screen/);
    });

    it('rejects a state that is not on the target screen', () => {
      const flows = fixture('flows');
      flows.transitions[3].to.stateId = 'editor-default';
      expectIssue(parseFlows(flows), ['transitions', 3, 'to', 'stateId'], /unknown state/);
    });

    it('allows omitting the state to target the default', () => {
      const flows = fixture('flows');
      delete flows.transitions[3].to.stateId;
      expect(parseFlows(flows).ok).toBe(true);
    });
  });

  it('rejects a layout key that is not a screen', () => {
    const flows = fixture('flows');
    flows.layout.ghost = { x: 0, y: 0 };
    expectIssue(parseFlows(flows), ['layout', 'ghost'], /unknown screen/);
  });

  it('rejects duplicate screen ids', () => {
    const flows = fixture('flows');
    flows.screens[2].id = 'login';
    expectIssue(parseFlows(flows), ['screens', 2, 'id'], /Duplicate screen id/);
  });

  it('rejects duplicate state ids within a screen', () => {
    const flows = fixture('flows');
    flows.screens[0].states[1].id = 'login-default';
    expectIssue(parseFlows(flows), ['screens', 0, 'states', 1, 'id'], /Duplicate state id/);
  });

  it('rejects duplicate CTA ids within a state', () => {
    const flows = fixture('flows');
    flows.screens[1].states[0].ctas[1].id = 'notes-new';
    expectIssue(
      parseFlows(flows),
      ['screens', 1, 'states', 0, 'ctas', 1, 'id'],
      /Duplicate CTA id/,
    );
  });

  it('rejects duplicate transition ids', () => {
    const flows = fixture('flows');
    flows.transitions[1].id = 't1';
    expectIssue(parseFlows(flows), ['transitions', 1, 'id'], /Duplicate transition id/);
  });

  it('does not validate screen entities against erd.json in v1', () => {
    const flows = fixture('flows');
    flows.screens[1].entities = ['not-an-entity'];
    expect(parseFlows(flows).ok).toBe(true);
  });
});
