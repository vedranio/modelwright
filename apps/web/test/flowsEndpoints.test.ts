import { describe, expect, it } from 'vitest';
import type { Flows, Transition } from '@modelwright/schema';
import {
  SCREEN_HANDLE,
  connectedCtas,
  fanPlaces,
  ctaHandle,
  screensById,
  stateHandle,
  transitionEndpoints,
} from '../src/flows/endpoints';
import { addTransition } from '../src/flows/ops';
import { notesFlows } from './fixtures';
import { must } from './helpers';

const t = (flows: Flows, id: string): Transition =>
  must(
    flows.transitions.find((x) => x.id === id),
    id,
  );
const ends = (flows: Flows, id: string) => transitionEndpoints(screensById(flows), t(flows, id));

describe('transitionEndpoints', () => {
  it('starts at the CTA row and, with stateId omitted, ends at the screen header', () => {
    const f = notesFlows();
    expect(ends(f, 't1')).toEqual({
      source: 'login',
      sourceHandle: ctaHandle('login-default', 'login-submit'),
      target: 'notes',
      targetHandle: SCREEN_HANDLE,
    });
  });

  it('ends at the state header for an explicit state on a multi-state screen', () => {
    const f = notesFlows();
    expect(ends(f, 't4')).toMatchObject({
      source: 'editor',
      sourceHandle: ctaHandle('editor-default', 'editor-back'),
      target: 'notes',
      targetHandle: stateHandle('notes-list'),
    });
  });

  it('resolves a single-state screen’s hidden state header to the screen header', () => {
    const { flows, id } = addTransition(
      notesFlows(),
      { screenId: 'notes', stateId: 'notes-list', ctaId: 'notes-open' },
      { screenId: 'editor', stateId: 'editor-default' },
    );
    expect(must(ends(flows, must(id))).targetHandle).toBe(SCREEN_HANDLE);
  });

  it('handles a same-screen target', () => {
    const { flows, id } = addTransition(
      notesFlows(),
      { screenId: 'login', stateId: 'login-default', ctaId: 'login-submit' },
      { screenId: 'login', stateId: 'login-error' },
    );
    expect(ends(flows, must(id))).toEqual({
      source: 'login',
      sourceHandle: ctaHandle('login-default', 'login-submit'),
      target: 'login',
      targetHandle: stateHandle('login-error'),
    });
  });

  it('is null when an end is missing', () => {
    const f = notesFlows();
    const broken = { ...t(f, 't1'), to: { screenId: 'gone' } };
    expect(transitionEndpoints(screensById(f), broken)).toBeNull();
    const noCta = { ...t(f, 't1'), from: { ...t(f, 't1').from, ctaId: 'gone' } };
    expect(transitionEndpoints(screensById(f), noCta)).toBeNull();
  });
});

describe('connectedCtas', () => {
  it('lists the CTAs that transitions start from', () => {
    const connected = connectedCtas(notesFlows());
    expect(connected.has('login-default:login-submit')).toBe(true);
    expect(connected.has('login-error:login-retry')).toBe(false);
  });
});

describe('fanPlaces', () => {
  it('numbers transitions that share a CTA', () => {
    const { flows, id } = addTransition(
      notesFlows(),
      { screenId: 'login', stateId: 'login-default', ctaId: 'login-submit' },
      { screenId: 'login', stateId: 'login-error' },
    );
    const places = fanPlaces(flows);
    expect(places.get('t1')).toEqual({ index: 0, count: 2 });
    expect(places.get(must(id))).toEqual({ index: 1, count: 2 });
    expect(places.get('t2')).toEqual({ index: 0, count: 1 });
  });
});
