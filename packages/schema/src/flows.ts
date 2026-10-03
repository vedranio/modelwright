import { z } from 'zod';
import { Id, Layout, checkLayoutKeys, checkUniqueIds } from './common';

export const Cta = z.strictObject({
  id: Id,
  label: z.string(),
});
export type Cta = z.infer<typeof Cta>;

export const ScreenState = z.strictObject({
  id: Id,
  name: z.string(),
  /** What the user can see. */
  sees: z.array(z.string()),
  /** What the user can do. */
  ctas: z.array(Cta),
});
export type ScreenState = z.infer<typeof ScreenState>;

export const Screen = z.strictObject({
  id: Id,
  name: z.string(),
  notes: z.string().optional(),
  /** Optional cross-reference to erd entity ids. Not validated across files in v1. */
  entities: z.array(Id).optional(),
  /** Always at least one; the first is the default state. */
  states: z.array(ScreenState).min(1, 'A screen needs at least one state'),
});
export type Screen = z.infer<typeof Screen>;

export const TransitionFrom = z.strictObject({
  screenId: Id,
  stateId: Id,
  ctaId: Id,
});
export type TransitionFrom = z.infer<typeof TransitionFrom>;

export const TransitionTo = z.strictObject({
  screenId: Id,
  /** Omitted → the target screen's default (first) state. */
  stateId: Id.optional(),
});
export type TransitionTo = z.infer<typeof TransitionTo>;

export const Transition = z.strictObject({
  id: Id,
  from: TransitionFrom,
  to: TransitionTo,
  label: z.string().optional(),
});
export type Transition = z.infer<typeof Transition>;

/** `.design/flows.json` — screens with their states inside, and the transitions between them. */
export const Flows = z
  .strictObject({
    schemaVersion: z.literal(1),
    screens: z.array(Screen),
    transitions: z.array(Transition),
    layout: Layout,
  })
  .superRefine((flows, ctx) => {
    checkUniqueIds(ctx, flows.screens, ['screens'], 'screen');
    checkUniqueIds(ctx, flows.transitions, ['transitions'], 'transition');
    flows.screens.forEach((screen, i) => {
      checkUniqueIds(ctx, screen.states, ['screens', i, 'states'], 'state');
      screen.states.forEach((state, j) => {
        checkUniqueIds(ctx, state.ctas, ['screens', i, 'states', j, 'ctas'], 'CTA');
      });
    });

    const screens = new Map(flows.screens.map((s) => [s.id, s]));
    flows.transitions.forEach((t, i) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', message, path: ['transitions', i, ...path] });

      const fromScreen = screens.get(t.from.screenId);
      if (!fromScreen) {
        issue(
          ['from', 'screenId'],
          `Transition "${t.id}" starts from unknown screen "${t.from.screenId}"`,
        );
      } else {
        const fromState = fromScreen.states.find((s) => s.id === t.from.stateId);
        if (!fromState) {
          issue(
            ['from', 'stateId'],
            `Transition "${t.id}" starts from unknown state "${t.from.stateId}" on screen "${fromScreen.id}"`,
          );
        } else if (!fromState.ctas.some((c) => c.id === t.from.ctaId)) {
          issue(
            ['from', 'ctaId'],
            `Transition "${t.id}" starts from unknown CTA "${t.from.ctaId}" on state "${fromState.id}"`,
          );
        }
      }

      const toScreen = screens.get(t.to.screenId);
      if (!toScreen) {
        issue(['to', 'screenId'], `Transition "${t.id}" goes to unknown screen "${t.to.screenId}"`);
      } else if (
        t.to.stateId !== undefined &&
        !toScreen.states.some((s) => s.id === t.to.stateId)
      ) {
        issue(
          ['to', 'stateId'],
          `Transition "${t.id}" goes to unknown state "${t.to.stateId}" on screen "${toScreen.id}"`,
        );
      }
    });

    checkLayoutKeys(ctx, flows.layout, new Set(screens.keys()), 'screen');
  });
export type Flows = z.infer<typeof Flows>;
