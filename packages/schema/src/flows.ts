import { z } from 'zod';
import { Id, Layout, checkAnchorKeys, checkLayoutKeys, checkUniqueIds } from './common';

export const Cta = z.strictObject({
  id: Id,
  label: z.string(),
  /** Added in schemaVersion 3. */
  note: z.string().optional(),
});
export type Cta = z.infer<typeof Cta>;

/** Something the user sees in a state. An object with an id since schemaVersion 3. */
export const InfoItem = z.strictObject({
  id: Id,
  text: z.string(),
  note: z.string().optional(),
});
export type InfoItem = z.infer<typeof InfoItem>;

export const ScreenState = z.strictObject({
  id: Id,
  name: z.string(),
  /** Notes on this state, e.g. when it shows. Added in schemaVersion 2. */
  notes: z.string().optional(),
  /** What the user can see. */
  sees: z.array(InfoItem),
  /** What the user can do. */
  ctas: z.array(Cta),
  /** The state's main CTA: one of `ctas`, at most one per state. Added in schemaVersion 2. */
  primaryCtaId: Id.optional(),
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

/** Which side of its card a transition's end is drawn on. */
export const FlowSide = z.enum(['left', 'right']);
export type FlowSide = z.infer<typeof FlowSide>;

/**
 * A transition's fixed sides; an end not given is routed automatically. The heights are fixed
 * by the CTA row and the target state. Layout, not meaning.
 */
export const TransitionAnchors = z.strictObject({
  from: FlowSide.optional(),
  to: FlowSide.optional(),
});
export type TransitionAnchors = z.infer<typeof TransitionAnchors>;

/** `.design/flows.json` — screens with their states inside, and the transitions between them. */
export const Flows = z
  .strictObject({
    schemaVersion: z.literal(3),
    screens: z.array(Screen),
    transitions: z.array(Transition),
    layout: Layout,
    /** Which sides transitions are drawn on, by transition id. Added in schemaVersion 3. */
    anchors: z.record(Id, TransitionAnchors).optional(),
  })
  .superRefine((flows, ctx) => {
    checkUniqueIds(ctx, flows.screens, ['screens'], 'screen');
    checkUniqueIds(ctx, flows.transitions, ['transitions'], 'transition');
    flows.screens.forEach((screen, i) => {
      checkUniqueIds(ctx, screen.states, ['screens', i, 'states'], 'state');
      screen.states.forEach((state, j) => {
        checkUniqueIds(ctx, state.ctas, ['screens', i, 'states', j, 'ctas'], 'CTA');
        checkUniqueIds(ctx, state.sees, ['screens', i, 'states', j, 'sees'], 'information item');
        if (
          state.primaryCtaId !== undefined &&
          !state.ctas.some((c) => c.id === state.primaryCtaId)
        ) {
          ctx.addIssue({
            code: 'custom',
            message: `Primary CTA "${state.primaryCtaId}" isn't one of state "${state.id}"'s CTAs`,
            path: ['screens', i, 'states', j, 'primaryCtaId'],
          });
        }
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
    checkAnchorKeys(ctx, flows.anchors, new Set(flows.transitions.map((t) => t.id)), 'transition');
  });
export type Flows = z.infer<typeof Flows>;
