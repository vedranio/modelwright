import type { Erd, Flows, Screen, Transition } from '@modelwright/schema';
import { SafeIds, inlineText, mermaidText } from './ids';

/** The id-maker and node lookups for one flowchart. */
function nodes(flows: Flows) {
  const ids = new SafeIds('s_');
  const screen = (id: string) => flows.screens.find((s) => s.id === id);
  /** A multi-state screen is a subgraph of its states; a single-state screen is one node. */
  const multi = (s: Screen) => s.states.length > 1;
  /** The node a transition leaves from: its CTA's state, or the screen itself. */
  const fromNode = (t: Transition) => {
    const s = screen(t.from.screenId);
    return s && multi(s) ? ids.get(s.id, t.from.stateId) : ids.get(t.from.screenId);
  };
  /** The node a transition lands on; with no `stateId`, a multi-state screen's default state. */
  const toNode = (t: Transition) => {
    const s = screen(t.to.screenId);
    if (!s || !multi(s)) return ids.get(t.to.screenId);
    return ids.get(s.id, t.to.stateId ?? s.states[0]?.id ?? '');
  };
  return { ids, multi, fromNode, toNode };
}

/** The CTA a transition leaves from. */
function ctaOf(flows: Flows, t: Transition) {
  return flows.screens
    .find((s) => s.id === t.from.screenId)
    ?.states.find((st) => st.id === t.from.stateId)
    ?.ctas.find((c) => c.id === t.from.ctaId);
}

/** An edge's words: the CTA's label, then the transition's own label if it has one. */
function edgeLabel(flows: Flows, t: Transition): string {
  const cta = ctaOf(flows, t)?.label.trim() ?? '';
  const own = t.label?.trim();
  return own ? (cta ? `${cta}: ${own}` : own) : cta;
}

/**
 * The flows as a Mermaid `flowchart LR`. A screen with several states is a subgraph holding a
 * node per state; a screen with one state is a single node. Each transition is an arrow from
 * its CTA's state to its target state, labelled with the CTA.
 */
export function flowsMermaid(flows: Flows): string {
  const { ids, multi, fromNode, toNode } = nodes(flows);
  const lines = ['flowchart LR'];
  for (const s of flows.screens) {
    const name = mermaidText(s.name) || ' ';
    if (!multi(s)) {
      lines.push(`  ${ids.get(s.id)}["${name}"]`);
      continue;
    }
    lines.push(`  subgraph ${ids.get(s.id)}["${name}"]`);
    for (const st of s.states) {
      lines.push(`    ${ids.get(s.id, st.id)}["${mermaidText(st.name) || ' '}"]`);
    }
    lines.push('  end');
  }
  for (const t of flows.transitions) {
    const label = mermaidText(edgeLabel(flows, t));
    lines.push(`  ${fromNode(t)} -->${label ? `|"${label}"|` : ''} ${toNode(t)}`);
  }
  return lines.join('\n');
}

/** "Notes › List", or just "Note editor" for a screen with one state. */
function destination(flows: Flows, t: Transition): string {
  const s = flows.screens.find((x) => x.id === t.to.screenId);
  if (!s) return inlineText(t.to.screenId);
  const state = s.states.find((st) => st.id === t.to.stateId) ?? s.states[0];
  return s.states.length > 1 && state
    ? `${inlineText(s.name)} › ${inlineText(state.name)}`
    : inlineText(s.name);
}

/**
 * The "Screens and flows" section: the diagram, then each screen's states with their notes,
 * what the user sees and can do, and where each CTA leads. The state's primary CTA is marked
 * "(primary)"; a CTA with nowhere to go is a "(dead end)".
 */
export function flowsSection(flows: Flows, erd: Erd): string[] {
  const out = ['## Screens and flows', ''];
  if (flows.screens.length === 0) {
    out.push('No screens yet.', '');
    return out;
  }
  out.push('```mermaid', flowsMermaid(flows), '```', '');

  for (const s of flows.screens) {
    out.push(`### ${inlineText(s.name) || '(unnamed)'}`, '');
    if (s.notes?.trim()) out.push(inlineText(s.notes), '');
    if (s.entities?.length) {
      const names = s.entities.map((id) => erd.entities.find((e) => e.id === id)?.name ?? id);
      out.push(`Uses: ${names.map(inlineText).join(', ')}`, '');
    }
    for (const [i, st] of s.states.entries()) {
      if (s.states.length > 1) {
        out.push(`#### ${inlineText(st.name) || '(unnamed)'}${i === 0 ? ' (default)' : ''}`, '');
      }
      if (st.notes?.trim()) out.push(inlineText(st.notes), '');
      out.push('Information:', '');
      if (st.sees.length === 0) out.push('- Nothing yet');
      for (const item of st.sees) out.push(`- ${inlineText(item)}`);
      out.push('', 'Actions:', '');
      if (st.ctas.length === 0) out.push('- Nothing yet');
      for (const cta of st.ctas) {
        const leads = flows.transitions.filter(
          (t) => t.from.screenId === s.id && t.from.stateId === st.id && t.from.ctaId === cta.id,
        );
        const primary = st.primaryCtaId === cta.id ? ' (primary)' : '';
        const label = `**${inlineText(cta.label) || '(unnamed)'}**${primary}`;
        if (leads.length === 0) {
          out.push(`- ${label} (dead end)`);
          continue;
        }
        const targets = leads.map((t) => {
          const own = t.label?.trim();
          return `→ ${destination(flows, t)}${own ? ` (${inlineText(own)})` : ''}`;
        });
        out.push(`- ${label} ${targets.join('; ')}`);
      }
      out.push('');
    }
  }
  return out;
}
