import { describe, expect, it } from 'vitest';
import { Flows } from '@modelwright/schema';
import { pruneAnchors } from '../src/canvas/anchors';
import {
  clearTransitionSides,
  dropSide,
  handleSide,
  nearerSide,
  setTransitionSide,
} from '../src/flows/anchors';
import { ctaHandle } from '../src/flows/endpoints';
import { deleteTransitions, duplicateScreens } from '../src/flows/ops';
import { routeTransitionSides } from '../src/flows/route';
import { notesFlows } from './fixtures';
import { deepFreeze, must } from './helpers';

const valid = (flows: Flows) => {
  const result = Flows.safeParse(flows);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return flows;
};
const card = { x: 0, y: 0, width: 260, height: 200 };

describe('transition sides', () => {
  it('fixes and clears either end, dropping the empty block', () => {
    const doc = deepFreeze(notesFlows());
    const id = must(doc.transitions[0]).id;
    const left = valid(setTransitionSide(doc, id, 'from', 'left'));
    expect(left.anchors).toEqual({ [id]: { from: 'left' } });
    expect(setTransitionSide(deepFreeze(left), id, 'from', 'left')).toBe(left);
    const both = valid(setTransitionSide(deepFreeze(left), id, 'to', 'right'));
    expect(both.anchors?.[id]).toEqual({ from: 'left', to: 'right' });
    expect(clearTransitionSides(deepFreeze(both), id)).not.toHaveProperty('anchors');
    expect(setTransitionSide(doc, 'nope', 'from', 'left')).toBe(doc);
  });

  it('reads the side from the CTA handle a drag starts on', () => {
    expect(handleSide(ctaHandle('st', 'cta', 'left'))).toBe('left');
    expect(handleSide(ctaHandle('st', 'cta'))).toBe('right');
  });

  it('picks a side from a drop near an edge, or the nearer half of the card', () => {
    expect(dropSide(card, { x: 10, y: 50 })).toBe('left');
    expect(dropSide(card, { x: 250, y: 50 })).toBe('right');
    expect(dropSide(card, { x: 130, y: 50 })).toBeNull();
    expect(nearerSide(card, { x: 100, y: 0 })).toBe('left');
    expect(nearerSide(card, { x: 200, y: 0 })).toBe('right');
  });

  it('copies sides with duplicated transitions, and prunes them with deleted ones', () => {
    const doc = notesFlows();
    const t = must(
      doc.transitions.find((x) => x.from.screenId === x.to.screenId) ?? doc.transitions[0],
    );
    const sided = setTransitionSide(doc, t.id, 'from', 'left');
    const screens = [t.from.screenId, t.to.screenId];
    const { flows } = duplicateScreens(sided, screens);
    valid(flows);
    const copy = must(flows.transitions.at(-1)).id;
    expect(flows.anchors?.[copy]).toEqual({ from: 'left' });
    const gone = deleteTransitions(sided, [t.id]);
    expect(valid(pruneAnchors(gone, gone.transitions))).not.toHaveProperty('anchors');
  });
});

describe('routeTransitionSides with fixed sides', () => {
  const a = { x: 100, y: 0, width: 260, height: 200 };
  const b = { x: 600, y: 0, width: 260, height: 200 };

  it('routes the usual way with nothing fixed, and leaves from the fixed side when there is', () => {
    expect(routeTransitionSides(50, 120, a, b)).toMatchObject({ from: 'right', to: 'left' });
    const left = routeTransitionSides(50, 120, a, b, undefined, 0, { from: 'left' });
    expect(left.from).toBe('left');
    expect(left.points[0]?.x).toBe(a.x);
  });

  it('arrives on the fixed side', () => {
    const route = routeTransitionSides(50, 120, a, b, undefined, 0, { to: 'right' });
    expect(route.to).toBe('right');
    expect(route.points.at(-1)?.x).toBe(b.x + b.width);
  });
});
