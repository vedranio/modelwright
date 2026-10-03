# Decisions

A log of the calls that shape modelwright, and why. Add to it whenever a decision changes the approach; don't rewrite history — append a dated entry that supersedes the old one.

## 2026-10-02 — Founding decisions

### Name: modelwright

A wright is a maker (playwright, shipwright). The tool makes models — data models, flow models — before any code exists. Conveys structure and craft rather than drawing or prompting.

### Two repos, one contract

The tool repo never contains project code. Each project gets a `.design/` folder holding `config.json`, `erd.json` and `flows.json`.

**Why:** the tool stays stack-agnostic because it only ever touches `.design/` and a URL. Projects can be deployed however their owner likes; the folder is inert. Design files version alongside the code they describe, and Claude Code can read them directly from the project repo without the tool in the loop.

### Meaning separate from layout

Each JSON file keeps its semantic block (`entities`/`relationships`, `screens`/`transitions`) apart from `layout: { [nodeId]: { x, y } }`.

**Why:** diffs stay readable, and Claude Code can add an entity or a screen without wrecking canvas positions.

### Canvas library: React Flow (`@xyflow/react`)

Both diagram views are one component with different node and edge types.

**Why:** infinite pan/zoom, trackpad gestures and a dot-grid background come for free. Multiple handles per node are native, so "drag from a CTA row to a screen" needs no custom interaction code. ERD needs custom crow's-foot SVG edge markers and an entity node with an inline-editable attribute table; the flow chart needs a screen node where each CTA row has its own source handle. Set `panOnScroll` with pinch-to-zoom so it behaves like Figma on a trackpad rather than zooming on every scroll.

### UI preview: iframe in a device frame

The toggle swaps the frame width (roughly 390 / 1280). In v1 the user starts the project's dev server themselves and the tool reads the URL from `config.json`.

**Why:** localhost dev servers embed fine, HMR included. Spawning the dev server from the tool is a phase-two nicety, not a v1 requirement.

### Decision 1 — How should the tool run? → Start web, wrap in Electron later

A plain local web app (Vite + small Node sidecar) now; Electron (electron-vite + React + TypeScript) later.

**Why:** less friction to start. Electron's real benefits — a native "open folder" dialog and user-agent overriding for the mobile preview — are not needed to validate the core idea.

**Consequence:** a thin platform boundary from day one. Everything that touches disk goes through a `ProjectClient` interface (`openProject`, `readDesign`, `writeDesign`, `listRecent`) with an HTTP implementation now and an IPC implementation later. The wrap becomes a swap, not a rewrite.

**Accepted trade-offs for now:** the project picker is a recents list plus a pasted path (browsers can't hand a server an absolute path from a folder dialog), and the mobile preview is viewport-width only with no user-agent override. Both are the first things Electron fixes.

### Decision 2 — How deep should the ERD go? → Conceptual first, physical later

v1 attributes are `{ id, name, note? }`. No types, keys or nullability yet.

**Why:** keeps phase one small and keeps the tool useful at the sketching stage. Attributes are objects rather than strings so going physical is additive: bump to `schemaVersion: 2`, add `type`, `key`, `nullable`, ship a migration in `packages/schema`. No rewrite.

### Decision 3 — How should screen states work in the flow view? → States live inside the screen node

One node per screen; states stacked inside it. Every screen has at least one state and the first is the default. A target handle on each state header (plus the screen header for "default"), a source handle on every CTA row. Dragging from a CTA to a state header creates the transition. A transition whose `to` omits `stateId` targets the default state.

**Why:** a screen's states belong together visually and semantically; separate nodes per state would scatter one screen across the canvas.

**Open problem:** density. A screen with three states, each with a "sees" list and four CTAs, is a tall card. Options are all-expanded with compact rows, or collapsible states where a collapsed state's edges reroute to its header. Starting all-expanded and letting real use decide. This is the single best thing to work through in Claude Design before code, because it is a visual judgement call.

### Schema package first, locked before any UI

`packages/schema` holds TypeScript types, zod validators and migrations for all three `.design/` files.

**Why:** it is the contract everything else depends on — the tool, the server, and the `/build-from-design` skill in each project repo.

### Phase one has no canvas

Phase one ends when you can point the tool at a folder, see three empty views, hand-edit `erd.json`, and see the change reflected.

**Why:** prove the contract and the round trip hold up before investing in React Flow. The canvas is session two.

### Two small additions from the start

- `docs/decisions.md` (this file) logging the calls made and why.
- An optional `entities?: string[]` field on screens so ERD and flows can cross-reference later without a schema change.

### Claude Design vs Claude Code

**Claude Design** for anything judged by looking at it: the app shell and view toggle, the entity card, the lo-fi screen card (name / sees / can do), the device frame, empty states. Exports go into `design-refs/` and Claude Code is pointed at them — "match this" beats describing it. Later, once a project's lo-fi flows are settled, Claude Design is also where screens go hi-fi.

**Claude Code** for everything else: one phase per session, plan mode first, commit at each milestone, Vitest on the schema and file I/O layer, browser tool to verify canvases against design refs, and eventually a `/build-from-design` skill in each project repo that reads `erd.json` → schema/migrations and `flows.json` → route and screen stubs. A Mermaid export is a cheap add that makes both diagrams readable in GitHub too.
