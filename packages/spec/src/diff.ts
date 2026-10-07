import type {
  Cardinality,
  Config,
  Entity,
  Erd,
  Flows,
  Relationship,
  Screen,
  ScreenState,
  Transition,
} from '@modelwright/schema';
import {
  CARDINALITY_WORDS,
  NEUTRAL_VERB,
  REVERSE_VERB,
  counted,
  relationshipSentences,
} from './erd';

/** The three design files, as compared by `diffDesign`. */
export interface Design {
  config: Config;
  erd: Erd;
  flows: Flows;
}

/** The ids a change concerns, so a build can find the code for them. */
export interface ChangeIds {
  entityId?: string;
  attributeId?: string;
  relationshipId?: string;
  screenId?: string;
  stateId?: string;
  ctaId?: string;
  transitionId?: string;
}

export type ChangeKind =
  | 'entity-added'
  | 'entity-removed'
  | 'entity-renamed'
  | 'entity-description-changed'
  | 'attribute-added'
  | 'attribute-removed'
  | 'attribute-renamed'
  | 'attribute-note-changed'
  | 'attributes-reordered'
  | 'relationship-added'
  | 'relationship-removed'
  | 'relationship-cardinality-changed'
  | 'relationship-label-changed'
  | 'relationship-reversed'
  | 'relationship-reconnected'
  | 'screen-added'
  | 'screen-removed'
  | 'screen-renamed'
  | 'screen-notes-changed'
  | 'screen-entities-changed'
  | 'default-state-changed'
  | 'states-reordered'
  | 'state-added'
  | 'state-removed'
  | 'state-renamed'
  | 'state-notes-changed'
  | 'information-added'
  | 'information-removed'
  | 'information-changed'
  | 'cta-added'
  | 'cta-removed'
  | 'cta-renamed'
  | 'ctas-reordered'
  | 'primary-cta-changed'
  | 'cta-now-dead-end'
  | 'cta-no-longer-dead-end'
  | 'transition-added'
  | 'transition-removed'
  | 'transition-retargeted'
  | 'transition-moved'
  | 'transition-label-changed'
  | 'project-renamed'
  | 'preview-url-changed';

/** One change, in plain words, with the ids it concerns. */
export interface Change {
  kind: ChangeKind;
  ids: ChangeIds;
  text: string;
}

/** Changes grouped as the spec is: data model, screens and flows, config. */
export interface DesignDiff {
  dataModel: Change[];
  screens: Change[];
  config: Change[];
}

/** How many changes a diff holds. */
export function changeCount(diff: DesignDiff): number {
  return diff.dataModel.length + diff.screens.length + diff.config.length;
}

/**
 * What changed between two designs, compared by id, so a rename is a rename rather than a
 * removal plus an addition. Layout is never read: moving a card is not a change. Pure and
 * deterministic: changes follow the newer design's order, with removed items at the place
 * they had in the older one.
 */
export function diffDesign(before: Design, after: Design): DesignDiff {
  return {
    dataModel: diffErd(before.erd, after.erd),
    screens: diffFlows(before, after),
    config: diffConfig(before.config, after.config),
  };
}

// --- Data model ---

function diffErd(before: Erd, after: Erd): Change[] {
  const out: Change[] = [];
  const old = byId(before.entities);
  const now = byId(after.entities);
  for (const id of mergedOrder(ids(before.entities), ids(after.entities))) {
    const a = old.get(id);
    const b = now.get(id);
    if (!a && b) out.push(entityAdded(b));
    else if (a && !b) {
      out.push({
        kind: 'entity-removed',
        ids: { entityId: id },
        text: `Removed entity ${q(a.name)}.`,
      });
    } else if (a && b) out.push(...entityChanges(a, b));
  }

  const oldRel = byId(before.relationships);
  const nowRel = byId(after.relationships);
  for (const id of mergedOrder(ids(before.relationships), ids(after.relationships))) {
    const a = oldRel.get(id);
    const b = nowRel.get(id);
    const at = { relationshipId: id };
    if (!a && b) {
      out.push({
        kind: 'relationship-added',
        ids: at,
        text: `Added a relationship: ${relationshipSentences(after, b)}`,
      });
    } else if (a && !b) {
      out.push({
        kind: 'relationship-removed',
        ids: at,
        text: `Removed a relationship: ${relationshipSentences(before, a)}`,
      });
    } else if (a && b) out.push(...relationshipChanges(before, after, a, b));
  }
  return out;
}

function entityAdded(e: Entity): Change {
  const parts = [`Added entity ${q(e.name)}`];
  if (e.description?.trim()) parts.push(`, described as ${q(e.description)}`);
  if (e.attributes.length) {
    parts.push(
      `, with ${e.attributes.length === 1 ? 'attribute' : 'attributes'} ${list(e.attributes.map((x) => x.name))}`,
    );
  }
  return { kind: 'entity-added', ids: { entityId: e.id }, text: `${parts.join('')}.` };
}

function entityChanges(a: Entity, b: Entity): Change[] {
  const out: Change[] = [];
  const entityId = b.id;
  const name = q(b.name);
  if (a.name !== b.name) {
    out.push({
      kind: 'entity-renamed',
      ids: { entityId },
      text: `Renamed entity ${q(a.name)} to ${name}.`,
    });
  }
  const text = optionalChange(a.description, b.description, {
    added: (v) => `Added a description to ${name}: ${q(v)}.`,
    removed: () => `Removed the description of ${name}.`,
    changed: (v, was) => `Changed the description of ${name} to ${q(v)} (was ${q(was)}).`,
  });
  if (text) out.push({ kind: 'entity-description-changed', ids: { entityId }, text });

  const old = byId(a.attributes);
  const now = byId(b.attributes);
  for (const id of mergedOrder(ids(a.attributes), ids(b.attributes))) {
    const x = old.get(id);
    const y = now.get(id);
    const at = { entityId, attributeId: id };
    if (!x && y) {
      const note = y.note?.trim() ? `, noted ${q(y.note)}` : '';
      out.push({
        kind: 'attribute-added',
        ids: at,
        text: `Added attribute ${q(y.name)} to ${name}${note}.`,
      });
    } else if (x && !y) {
      out.push({
        kind: 'attribute-removed',
        ids: at,
        text: `Removed attribute ${q(x.name)} from ${name}.`,
      });
    } else if (x && y) {
      if (x.name !== y.name) {
        out.push({
          kind: 'attribute-renamed',
          ids: at,
          text: `Renamed attribute ${q(x.name)} of ${name} to ${q(y.name)}.`,
        });
      }
      const attr = `${q(y.name)} of ${name}`;
      const note = optionalChange(x.note, y.note, {
        added: (v) => `Added a note to attribute ${attr}: ${q(v)}.`,
        removed: () => `Removed the note on attribute ${attr}.`,
        changed: (v, was) => `Changed the note on attribute ${attr} to ${q(v)} (was ${q(was)}).`,
      });
      if (note) out.push({ kind: 'attribute-note-changed', ids: at, text: note });
    }
  }
  if (reordered(ids(a.attributes), ids(b.attributes))) {
    out.push({
      kind: 'attributes-reordered',
      ids: { entityId },
      text: `Reordered the attributes of ${name}: ${list(b.attributes.map((x) => x.name))}.`,
    });
  }
  return out;
}

function relationshipChanges(before: Erd, after: Erd, a: Relationship, b: Relationship): Change[] {
  const at = { relationshipId: b.id };
  const nameIn = (erd: Erd, id: string) => erd.entities.find((e) => e.id === id)?.name ?? id;
  const sameEnds = a.from === b.from && a.to === b.to;
  const swapped = a.from === b.to && a.to === b.from && a.from !== a.to;

  if (!sameEnds && swapped) {
    return [
      {
        kind: 'relationship-reversed',
        ids: at,
        text: `Reversed the relationship between ${q(nameIn(after, b.to))} and ${q(nameIn(after, b.from))}. It now reads: ${relationshipSentences(after, b)}`,
      },
    ];
  }
  if (!sameEnds) {
    return [
      {
        kind: 'relationship-reconnected',
        ids: at,
        text: `The relationship between ${q(nameIn(before, a.from))} and ${q(nameIn(before, a.to))} now joins ${q(nameIn(after, b.from))} and ${q(nameIn(after, b.to))}. It now reads: ${relationshipSentences(after, b)}`,
      },
    ];
  }

  const out: Change[] = [];
  const from = nameIn(after, b.from);
  const to = nameIn(after, b.to);
  const verb = b.label?.trim() || NEUTRAL_VERB;
  const sentences: string[] = [];
  if (a.toCard !== b.toCard) {
    sentences.push(`Each ${from} now ${verb} ${counted(b.toCard, to)} (was ${words(a.toCard)}).`);
  }
  if (a.fromCard !== b.fromCard) {
    sentences.push(
      `Each ${to} now ${REVERSE_VERB} ${counted(b.fromCard, from)} (was ${words(a.fromCard)}).`,
    );
  }
  if (sentences.length) {
    out.push({ kind: 'relationship-cardinality-changed', ids: at, text: sentences.join(' ') });
  }
  const between = `The relationship from ${q(from)} to ${q(to)}`;
  const label = optionalChange(a.label, b.label, {
    added: (v) => `${between} is now labelled ${q(v)}.`,
    removed: (was) => `${between} is no longer labelled ${q(was)}.`,
    changed: (v, was) => `${between} is now labelled ${q(v)} (was ${q(was)}).`,
  });
  if (label) out.push({ kind: 'relationship-label-changed', ids: at, text: label });
  return out;
}

function words(card: Cardinality): string {
  return CARDINALITY_WORDS[card].words;
}

// --- Screens and flows ---

/** Where a CTA lives: screen › state › CTA. */
type CtaKey = string;
const ctaKey = (screenId: string, stateId: string, ctaId: string): CtaKey =>
  JSON.stringify([screenId, stateId, ctaId]);

function diffFlows(beforeDesign: Design, afterDesign: Design): Change[] {
  const before = beforeDesign.flows;
  const after = afterDesign.flows;
  const out: Change[] = [];
  const old = byId(before.screens);
  const now = byId(after.screens);
  const leadsBefore = leads(before);
  const leadsAfter = leads(after);

  for (const id of mergedOrder(ids(before.screens), ids(after.screens))) {
    const a = old.get(id);
    const b = now.get(id);
    if (!a && b) out.push(screenAdded(b));
    else if (a && !b) {
      out.push({
        kind: 'screen-removed',
        ids: { screenId: id },
        text: `Removed screen ${q(a.name)}.`,
      });
    } else if (a && b) {
      out.push(...screenChanges(beforeDesign, afterDesign, a, b, leadsBefore, leadsAfter));
    }
  }

  const oldT = byId(before.transitions);
  const nowT = byId(after.transitions);
  for (const id of mergedOrder(ids(before.transitions), ids(after.transitions))) {
    const a = oldT.get(id);
    const b = nowT.get(id);
    const at = (t: Transition) => ({
      transitionId: t.id,
      screenId: t.from.screenId,
      stateId: t.from.stateId,
      ctaId: t.from.ctaId,
    });
    if (!a && b) {
      out.push({
        kind: 'transition-added',
        ids: at(b),
        text: `Added a transition: ${source(after, b)} → ${destination(after, b)}${labelSuffix(b)}.`,
      });
    } else if (a && !b) {
      // A transition that went with its CTA (or state, or screen), or with its target screen,
      // is part of that removal, or shows up as a new dead end.
      const ctaGone = !findCta(after, a.from.screenId, a.from.stateId, a.from.ctaId);
      const targetGone = !now.has(a.to.screenId);
      if (ctaGone || targetGone) continue;
      out.push({
        kind: 'transition-removed',
        ids: at(a),
        text: `Removed the transition ${source(after, a)} → ${destination(after, a)}${labelSuffix(a)}.`,
      });
    } else if (a && b) {
      out.push(...transitionChanges(before, after, a, b, at(b)));
    }
  }
  return out;
}

function screenAdded(s: Screen): Change {
  const states = s.states.length > 1 ? `, with states ${list(s.states.map((st) => st.name))}` : '';
  return {
    kind: 'screen-added',
    ids: { screenId: s.id },
    text: `Added screen ${q(s.name)}${states}.`,
  };
}

function screenChanges(
  beforeDesign: Design,
  afterDesign: Design,
  a: Screen,
  b: Screen,
  leadsBefore: Map<CtaKey, Transition[]>,
  leadsAfter: Map<CtaKey, Transition[]>,
): Change[] {
  const out: Change[] = [];
  const screenId = b.id;
  const name = q(b.name);
  if (a.name !== b.name) {
    out.push({
      kind: 'screen-renamed',
      ids: { screenId },
      text: `Renamed screen ${q(a.name)} to ${name}.`,
    });
  }
  const notes = optionalChange(a.notes, b.notes, {
    added: (v) => `Added notes to ${name}: ${q(v)}.`,
    removed: () => `Removed the notes on ${name}.`,
    changed: (v, was) => `Changed the notes on ${name} to ${q(v)} (was ${q(was)}).`,
  });
  if (notes) out.push({ kind: 'screen-notes-changed', ids: { screenId }, text: notes });

  const usesBefore = a.entities ?? [];
  const usesAfter = b.entities ?? [];
  const entityName = (id: string) =>
    afterDesign.erd.entities.find((e) => e.id === id)?.name ??
    beforeDesign.erd.entities.find((e) => e.id === id)?.name ??
    id;
  const added = usesAfter.filter((id) => !usesBefore.includes(id));
  const removed = usesBefore.filter((id) => !usesAfter.includes(id));
  if (added.length || removed.length) {
    const parts: string[] = [];
    if (added.length) parts.push(`now uses ${list(added.map(entityName))}`);
    if (removed.length) parts.push(`no longer uses ${list(removed.map(entityName))}`);
    out.push({
      kind: 'screen-entities-changed',
      ids: { screenId },
      text: `Screen ${name} ${parts.join(' and ')}.`,
    });
  }

  const firstBefore = a.states[0];
  const firstAfter = b.states[0];
  if (firstBefore && firstAfter && firstBefore.id !== firstAfter.id) {
    out.push({
      kind: 'default-state-changed',
      ids: { screenId, stateId: firstAfter.id },
      text: `${name} now opens in state ${q(firstAfter.name)} (was ${q(firstBefore.name)}).`,
    });
  }
  if (reordered(ids(a.states), ids(b.states))) {
    out.push({
      kind: 'states-reordered',
      ids: { screenId },
      text: `Reordered the states of ${name}: ${list(b.states.map((st) => st.name))}.`,
    });
  }

  const old = byId(a.states);
  const now = byId(b.states);
  for (const id of mergedOrder(ids(a.states), ids(b.states))) {
    const x = old.get(id);
    const y = now.get(id);
    const at = { screenId, stateId: id };
    if (!x && y) {
      out.push({ kind: 'state-added', ids: at, text: `Added state ${q(y.name)} to ${name}.` });
    } else if (x && !y) {
      out.push({
        kind: 'state-removed',
        ids: at,
        text: `Removed state ${q(x.name)} from ${name}.`,
      });
    } else if (x && y) {
      if (x.name !== y.name) {
        out.push({
          kind: 'state-renamed',
          ids: at,
          text: `Renamed state ${q(x.name)} of ${name} to ${q(y.name)}.`,
        });
      }
      out.push(...stateChanges(afterDesign.flows, b, x, y, leadsBefore, leadsAfter));
    }
  }
  return out;
}

function stateChanges(
  after: Flows,
  screen: Screen,
  a: ScreenState,
  b: ScreenState,
  leadsBefore: Map<CtaKey, Transition[]>,
  leadsAfter: Map<CtaKey, Transition[]>,
): Change[] {
  const out: Change[] = [];
  const where = q(place(screen, b));
  const at = { screenId: screen.id, stateId: b.id };

  const notes = optionalChange(a.notes, b.notes, {
    added: (v) => `Added notes to ${where}: ${q(v)}.`,
    removed: () => `Removed the notes on ${where}.`,
    changed: (v, was) => `Changed the notes on ${where} to ${q(v)} (was ${q(was)}).`,
  });
  if (notes) out.push({ kind: 'state-notes-changed', ids: at, text: notes });

  for (const step of alignText(a.sees, b.sees)) {
    if (step.op === 'changed') {
      out.push({
        kind: 'information-changed',
        ids: at,
        text: `Changed information ${q(step.was)} in ${where} to ${q(step.now)}.`,
      });
    } else if (step.op === 'removed') {
      out.push({
        kind: 'information-removed',
        ids: at,
        text: `Removed information ${q(step.was)} from ${where}.`,
      });
    } else {
      out.push({
        kind: 'information-added',
        ids: at,
        text: `Added information ${q(step.now)} to ${where}.`,
      });
    }
  }

  const old = byId(a.ctas);
  const now = byId(b.ctas);
  for (const id of mergedOrder(ids(a.ctas), ids(b.ctas))) {
    const x = old.get(id);
    const y = now.get(id);
    const ctaIds = { ...at, ctaId: id };
    const key = ctaKey(screen.id, b.id, id);
    if (!x && y) {
      const dead = (leadsAfter.get(key) ?? []).length === 0 ? ' (dead end)' : '';
      out.push({
        kind: 'cta-added',
        ids: ctaIds,
        text: `Added action ${q(y.label)} to ${where}${dead}.`,
      });
    } else if (x && !y) {
      out.push({
        kind: 'cta-removed',
        ids: ctaIds,
        text: `Removed action ${q(x.label)} from ${where}.`,
      });
    } else if (x && y) {
      if (x.label !== y.label) {
        out.push({
          kind: 'cta-renamed',
          ids: ctaIds,
          text: `Renamed action ${q(x.label)} in ${where} to ${q(y.label)}.`,
        });
      }
      const deadBefore = (leadsBefore.get(key) ?? []).length === 0;
      const deadAfter = (leadsAfter.get(key) ?? []).length === 0;
      if (!deadBefore && deadAfter) {
        out.push({
          kind: 'cta-now-dead-end',
          ids: ctaIds,
          text: `Action ${q(y.label)} in ${where} is now a dead end.`,
        });
      } else if (deadBefore && !deadAfter) {
        const targets = (leadsAfter.get(key) ?? []).map((t) => destination(after, t));
        out.push({
          kind: 'cta-no-longer-dead-end',
          ids: ctaIds,
          text: `Action ${q(y.label)} in ${where} is no longer a dead end: it leads to ${targets.join(' and ')}.`,
        });
      }
    }
  }
  if (a.primaryCtaId !== b.primaryCtaId) {
    const label = (st: ScreenState, id: string | undefined) =>
      id === undefined ? undefined : (st.ctas.find((c) => c.id === id)?.label ?? id);
    const text = optionalChange(label(a, a.primaryCtaId), label(b, b.primaryCtaId), {
      added: (v) => `${q(v)} is now the primary action in ${where}.`,
      removed: (was) => `${where} no longer has a primary action (was ${q(was)}).`,
      changed: (v, was) => `${q(v)} is now the primary action in ${where} (was ${q(was)}).`,
    });
    // Two CTAs can share a label: the ids changed, so it's a change either way.
    if (text ?? b.primaryCtaId !== undefined) {
      out.push({
        kind: 'primary-cta-changed',
        ids: { ...at, ...(b.primaryCtaId !== undefined && { ctaId: b.primaryCtaId }) },
        text:
          text ??
          `The primary action in ${where} is now another one labelled ${q(label(b, b.primaryCtaId) ?? '')}.`,
      });
    }
  }
  if (reordered(ids(a.ctas), ids(b.ctas))) {
    out.push({
      kind: 'ctas-reordered',
      ids: at,
      text: `Reordered the actions in ${where}: ${list(b.ctas.map((c) => c.label))}.`,
    });
  }
  return out;
}

function transitionChanges(
  before: Flows,
  after: Flows,
  a: Transition,
  b: Transition,
  at: ChangeIds,
): Change[] {
  const out: Change[] = [];
  const movedFrom =
    a.from.screenId !== b.from.screenId ||
    a.from.stateId !== b.from.stateId ||
    a.from.ctaId !== b.from.ctaId;
  if (movedFrom) {
    out.push({
      kind: 'transition-moved',
      ids: at,
      text: `The transition to ${destination(after, b)} now starts from ${source(after, b)} (was ${sourceNow(before, after, a)}).`,
    });
  }
  if (a.to.screenId !== b.to.screenId || a.to.stateId !== b.to.stateId) {
    out.push({
      kind: 'transition-retargeted',
      ids: at,
      text: `${source(after, b)} now leads to ${destination(after, b)} (was ${destinationNow(before, after, a)}).`,
    });
  }
  const transition = `The transition ${source(after, b)} → ${destination(after, b)}`;
  const label = optionalChange(a.label, b.label, {
    added: (v) => `${transition} is now labelled ${q(v)}.`,
    removed: (was) => `${transition} is no longer labelled ${q(was)}.`,
    changed: (v, was) => `${transition} is now labelled ${q(v)} (was ${q(was)}).`,
  });
  if (label) out.push({ kind: 'transition-label-changed', ids: at, text: label });
  return out;
}

/** Every CTA's outgoing transitions, in document order. */
function leads(flows: Flows): Map<CtaKey, Transition[]> {
  const out = new Map<CtaKey, Transition[]>();
  for (const t of flows.transitions) {
    const key = ctaKey(t.from.screenId, t.from.stateId, t.from.ctaId);
    out.set(key, [...(out.get(key) ?? []), t]);
  }
  return out;
}

function findCta(flows: Flows, screenId: string, stateId: string, ctaId: string) {
  return flows.screens
    .find((s) => s.id === screenId)
    ?.states.find((st) => st.id === stateId)
    ?.ctas.find((c) => c.id === ctaId);
}

/** "Notes › List", or just "Note editor" for a screen with one state. */
function place(screen: Screen, state: ScreenState): string {
  return screen.states.length > 1
    ? `${named(screen.name)} › ${named(state.name)}`
    : named(screen.name);
}

/** "“Sign in” in “Login”": where a transition starts. */
function source(flows: Flows, t: Transition): string {
  const screen = flows.screens.find((s) => s.id === t.from.screenId);
  const state = screen?.states.find((st) => st.id === t.from.stateId);
  const cta = state?.ctas.find((c) => c.id === t.from.ctaId);
  const where = screen && state ? place(screen, state) : t.from.screenId;
  return `${q(cta?.label ?? t.from.ctaId)} in ${q(where)}`;
}

/** Where `t` started, named as it is now when its CTA still exists, otherwise as it was. */
function sourceNow(before: Flows, after: Flows, t: Transition): string {
  return findCta(after, t.from.screenId, t.from.stateId, t.from.ctaId)
    ? source(after, t)
    : source(before, t);
}

/** Where `t` led, named as it is now when that screen (and state) still exist, otherwise as it was. */
function destinationNow(before: Flows, after: Flows, t: Transition): string {
  const screen = after.screens.find((s) => s.id === t.to.screenId);
  const exists = screen && (!t.to.stateId || screen.states.some((st) => st.id === t.to.stateId));
  return exists ? destination(after, t) : destination(before, t);
}

/** "“Notes › List”", or "“Notes”" for a transition to a screen's default state. */
function destination(flows: Flows, t: Transition): string {
  const screen = flows.screens.find((s) => s.id === t.to.screenId);
  if (!screen) return q(t.to.screenId);
  const state = t.to.stateId ? screen.states.find((st) => st.id === t.to.stateId) : undefined;
  return q(state && screen.states.length > 1 ? place(screen, state) : named(screen.name));
}

function labelSuffix(t: Transition): string {
  return t.label?.trim() ? `, labelled ${q(t.label)}` : '';
}

// --- Config ---

function diffConfig(a: Config, b: Config): Change[] {
  const out: Change[] = [];
  if (a.name !== b.name) {
    out.push({
      kind: 'project-renamed',
      ids: {},
      text: `Renamed the project ${q(a.name)} to ${q(b.name)}.`,
    });
  }
  const url = optionalChange(a.preview.url, b.preview.url, {
    added: (v) => `Set the preview URL to ${v}.`,
    removed: (was) => `Removed the preview URL (was ${was}).`,
    changed: (v, was) => `Changed the preview URL to ${v} (was ${was}).`,
  });
  if (url) out.push({ kind: 'preview-url-changed', ids: {}, text: url });
  return out;
}

// --- Helpers ---

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map((item) => item.id);
}

/**
 * Every id from both lists: the newer list's order, with each id that's gone placed right
 * after the id it followed in the older list.
 */
export function mergedOrder(before: readonly string[], after: readonly string[]): string[] {
  const result = [...after];
  let anchor = -1;
  for (const id of before) {
    const index = result.indexOf(id);
    if (index >= 0) {
      anchor = index;
      continue;
    }
    result.splice(anchor + 1, 0, id);
    anchor += 1;
  }
  return result;
}

/** Whether the ids both lists share are in a different order. */
function reordered(before: readonly string[], after: readonly string[]): boolean {
  const kept = new Set(after);
  const common = before.filter((id) => kept.has(id));
  const was = new Set(before);
  const now = after.filter((id) => was.has(id));
  return common.some((id, i) => now[i] !== id);
}

export type TextStep =
  | { op: 'added'; now: string }
  | { op: 'removed'; was: string }
  | { op: 'changed'; was: string; now: string };

/**
 * Lines up two lists of strings that have no ids. Equal items are matched in order (longest
 * common subsequence). In each gap between matches, removed and added items pair up in order
 * as changes; any left over are plain removals or additions.
 */
export function alignText(before: readonly string[], after: readonly string[]): TextStep[] {
  const n = before.length;
  const m = after.length;
  // lcs(i, j): length of the longest common subsequence of before[i..] and after[j..].
  const table = new Array<number>((n + 1) * (m + 1)).fill(0);
  const lcs = (i: number, j: number) => table[i * (m + 1) + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] =
        before[i] === after[j] ? lcs(i + 1, j + 1) + 1 : Math.max(lcs(i + 1, j), lcs(i, j + 1));
    }
  }

  const out: TextStep[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    removed.forEach((was, k) => {
      const now = added[k];
      out.push(now === undefined ? { op: 'removed', was } : { op: 'changed', was, now });
    });
    for (const now of added.slice(removed.length)) out.push({ op: 'added', now });
    removed = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  for (;;) {
    const was = before[i];
    const now = after[j];
    if (was === undefined && now === undefined) break;
    if (was !== undefined && was === now) {
      flush();
      i++;
      j++;
    } else if (now !== undefined && (was === undefined || lcs(i, j + 1) >= lcs(i + 1, j))) {
      added.push(now);
      j++;
    } else if (was !== undefined) {
      removed.push(was);
      i++;
    }
  }
  flush();
  return out;
}

/** Describes an optional string that was added, removed or changed; `null` when unchanged. */
function optionalChange(
  was: string | undefined,
  now: string | undefined,
  say: {
    added: (now: string) => string;
    removed: (was: string) => string;
    changed: (now: string, was: string) => string;
  },
): string | null {
  const a = was?.trim() ? was : undefined;
  const b = now?.trim() ? now : undefined;
  if (a === b) return null;
  if (a === undefined) return b === undefined ? null : say.added(b);
  if (b === undefined) return say.removed(a);
  return say.changed(b, a);
}

/** A name as written, or "(unnamed)" when blank, as the spec shows it. */
function named(name: string): string {
  return name.replace(/\s+/g, ' ').trim() || '(unnamed)';
}

/** A name in quotes. */
function q(name: string): string {
  return `“${named(name)}”`;
}

/** “a”, “b” and “c”. */
function list(names: readonly string[]): string {
  const quoted = names.map(q);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}
