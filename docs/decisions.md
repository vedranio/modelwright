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

## 2026-10-03 — Phase 1 planning decisions

Settled in the phase 1 interview before any code was written. Each changes or sharpens something the brief left open.

### `init` fills missing files instead of refusing on an existing `.design/`

`POST /api/projects/init` writes only the files that are missing from `.design/` and never overwrites one. It returns 409 only when all three already exist.

**Why:** the brief had a dead end — a `.design/` folder with one or two files is reported as `initialised: false` by `open`, but `init` refused because the folder existed. Filling the gaps is safe because nothing is ever overwritten.

### Unknown keys are rejected, not stripped

Every object in the v1 schema is strict. An unrecognised key is a validation error with its issue path.

**Why:** zod strips unknown keys by default, so a hand-edit typo (`desciption`) would silently vanish on the next save. Rejecting it surfaces the mistake where the user can see and fix it, which is the point of the validation surface. Phase 2+ adding fields means a `schemaVersion` bump anyway.

### Dedicated ports: web 4300, server 4301

Both use `strictPort`, so a clash fails loudly rather than drifting to another port.

**Why:** Vite's default 5173 is also the port most designed projects' own dev servers run on — including the phase 1 fixture's preview URL. The tool must not collide with the thing it previews.

### Origin/Host guard on the server

The server rejects requests whose `Host` isn't its own loopback address, or whose `Origin` (when present) isn't the web app's.

**Why:** binding to `127.0.0.1` stops other machines, not other websites. Without the guard, any page open in the browser could POST to the server and create or overwrite `.design/` files in any folder, and DNS rebinding could read them. The guard is small and closes both.

### Smaller defaults

- **Id uniqueness is scoped to the collection.** Entities, relationships, screens and transitions are unique file-wide; attributes per entity, states per screen, CTAs per state. Transitions address a CTA as screen → state → cta, so nothing needs global uniqueness.
- **Layout is optional per node.** Every `layout` key must reference a real node, but a node may have no layout entry — phase 2 places unpositioned nodes.
- **Canonical serialisation.** Keys are written in the schema's declared order (`schemaVersion` first, `layout` last), 2-space indent, trailing newline, array order preserved. Re-saving an untouched file produces no diff.
- **The schema package ships as TypeScript source** inside the workspace, with no build step. The server's production build bundles it.
- **Renaming a project updates its recents entry** so the picker never shows a stale name.
- **Re-read on window focus** is included (the brief's nice-to-have), suppressed while the name field is being edited.

### Tooling: TypeScript pinned to 6.0

`typescript@latest` is 7.0, but typescript-eslint supports only `<6.1`. TypeScript stays on 6.0.x until typescript-eslint supports 7; revisit then.

### Briefs and docs are excluded from Prettier

`docs/` and `CLAUDE.md` are in `.prettierignore`. They are authored outside this repo's tooling and pushed to GitHub; a formatter rewrite would create noisy diffs against the source of truth.

## 2026-10-03 — Phase 1 server details

### A symlinked `.design/` is refused

`init` and every write require `<project>/.design` to be a real directory, checked with `lstat`. A symlink there gets a 409.

**Why:** "writes only inside `.design/`" should mean physically, not just by path. A `.design` symlink would redirect writes anywhere on disk. No real project needs one.

### Writes require an existing `.design/`

`PUT /api/design/:file` returns 409 if `.design/` doesn't exist rather than creating it. Creating `.design/` is `init`'s job, so a write can never initialise a project as a side effect.

### Shared API shapes live in the schema package

`ProjectSummary` and `ApiErrorBody` sit in `packages/schema/src/api.ts`, beside `DesignError`, so the server and `ProjectClient` share one definition. They are not part of the `.design/` file contract and change without a `schemaVersion` bump.

## 2026-10-05 — Phase 2 planning decisions

Settled in the phase 2 interview before any code was written.

### The brief's decisions stand as written

Crow's-foot semantics (`fromCard` at the `from` end; `many` is one-or-more, `zero-many` zero-or-more); new relationships default to `one` → `zero-many`; autosave about 500 ms after the last edit and immediately on drag stop, view switch and close; local edits win while dirty; opening a project never writes; the viewport lives in `localStorage`; confirmation stands in for undo; the picker is a modal that can't be dismissed with no project open; IBM Plex Mono, self-hosted; `lastOpenedAt` and `displayPath` are the only server changes; a keyboard hint shows only for a shortcut that works; no self-relationships from the UI.

### Empty states follow the hint rule, not the letter of 05

- **Flows:** 05's heading and copy, without the "Add screen S" button. Adding screens is phase 3; a button that does nothing would break the hint rule.
- **ERD:** the 05 card without its button until milestone 4, when "Add entity E" works. From milestone 1 the card floats over the dot-grid canvas, with the toolbar still visible.
- **UI:** with no preview URL, only 05's card. With a URL set, phase 1's URL and device list stay, restyled with tokens.

### ⌘R reloads the design files

The page intercepts ⌘R (Ctrl+R off macOS) on keydown and calls `preventDefault`, verified in Chromium. Safari is to be checked at the milestone 0 gate; if it doesn't comply, the ⌘R hints are hidden in the web build and left for Electron. ⇧⌘R is left alone so a hard reload is still possible. As with every shortcut, it doesn't fire while a text field has focus.

### Ids use a lowercase alphabet

`ent_`, `attr_` and `rel_` are followed by 8 characters from `a-z0-9` (nanoid `customAlphabet`), retried on collision with existing ids. nanoid's default alphabet includes `-` and `_`, which makes ids harder to read in diffs.

### External edits while dirty: last writer wins

If `erd.json` changes on disk while there are unsaved local edits, the next autosave overwrites that change. There's no file watching in this phase. Revisit alongside undo and file watching.

### Recents rows keep the "not initialised" tag

The design doesn't show the tag, but a folder that was opened and never initialised is still listed, so it keeps a faint tag. Relative times count calendar days in local time: today, yesterday, N days ago, last week, N weeks ago, last month, N months ago, last year, N years ago.

### Smaller calls

- The README's `size / line-height` type tokens are split into pairs (`--text-sm` and `--text-sm-lh`), because a CSS custom property can't hold both halves usefully.
- Tokens added for values the design HTML uses but the README doesn't name: `--border-w`, `--focus-ring-w`, `--tracking-tight`, `--text-glyph`, `--logo-size`, `--status-dot`, `--dot-grid-*`, `--picker-main-w`, `--recent-row-h`, `--empty-card-w`, `--problems-w`, `--chip-h` and `--name-input-min-w`.
- A missing folder reads "No folder at that path", as in 02, rather than echoing the server's message with the full path.
- Copy problems falls back to a hidden textarea and `execCommand('copy')` when the Clipboard API is refused, as it is in some embedded browsers.
- `design-refs/` is in `.prettierignore`. Like `docs/`, it's authored outside this repo's tooling.

## 2026-10-05 — ⌘R left for Electron (supersedes "⌘R reloads the design files")

Checked by hand at the milestone 0 gate: both Chrome and Safari reload the page on ⌘R even though the app calls `preventDefault`. The browser handles the shortcut before the page sees it. The earlier Chromium check passed only because the test sent the key straight to the page, which skips the browser's own shortcut handling.

The web build no longer intercepts ⌘R, and every ⌘R hint is gone; under the hint rule, a hint shows only for a shortcut that works. The Reload buttons stay. Electron can bind ⌘R through its application menu, so the hint comes back with the Electron wrap. Until then ⌘R reloads the whole page: the app reopens the last project, and from milestone 4 the `beforeunload` warning protects unsaved edits.

## 2026-10-05 — Phase 2 milestone 1: canvas foundation

### Canvas behaviour

- **Fit never zooms past 100%,** on first open or with Fit/⇧1, so a two-entity diagram isn't blown up to 200%. Padding is 20% of the viewport.
- **Shift-click adds to the selection** (`multiSelectionKeyCode="Shift"`), as the brief asks; React Flow's default is ⌘. Shift+drag also draws a selection box.
- **⇧1 is matched by physical key** (`code === 'Digit1'`), so it works on layouts where Shift+1 isn't `!`.
- **Selection is kept by id** in `canvas/useSelection` and merged into the nodes and edges that views derive from the document. React Flow's nodes are controlled, so without this, clicks select nothing.
- **The box around a multi-selection is invisible.** The selected cards show their own state.
- **Viewport keys** are `viewport:<view>:<projectPath>`, so ERD and Flows remember their viewports separately.
- **Canvas animation and background values** are read from `tokens.css` at runtime (`canvas/tokens.ts`), so `--dot-grid-gap` and `--duration-fast` stay the single source.

### Placement estimates sizes

`placement.ts` estimates card sizes from the attribute count (`erd/metrics.ts`) rather than measuring the DOM, so it stays pure and runs the same before anything renders. The estimates are generous, and overestimating only adds space. `ENTITY_WIDTH` in `metrics.ts` and `--entity-w` in `tokens.css` must agree; each points at the other.

Unpositioned entities go in one row below the positioned ones, left-aligned with them. With nothing positioned, they form a four-column grid from the origin.

## 2026-10-05 — Phase 2 milestone 2: ERD operations

- **A missing target is a no-op, not an error.** An operation on an entity, attribute or relationship that no longer exists returns the document unchanged (the same object). `addAttribute` and `addRelationship` return `id: null`. An edit racing a delete, such as a blur committing a rename on an entity that was just deleted, shouldn't crash the editor.
- **Unchanged edits return the same object.** React can skip re-rendering, and the autosave won't mark the document dirty for nothing.
- **Blank optional strings remove their key.** An empty or whitespace-only description, note or label deletes the field rather than writing `""`, so the file never holds empty optionals.
- **Positions are rounded to whole canvas units** on `addEntity` and `moveEntities`, so a drag writes `"x": 412`, not `"x": 412.38671875`.
- **New attributes start with an empty name.** The schema allows it, and the editor drops the row if entry ends with it still empty.
- **New ids are unique across the whole file,** though the schema only requires attribute ids to be unique within their entity. That's simpler and never wrong.

## 2026-10-05 — Phase 2 milestone 3: entity card and crow's-foot edges

There's no design for these yet. Both are built from the existing tokens and judged at the milestone 3 gate.

- **Card:** surface, `--radius-lg`, `--shadow-sm` (`--shadow-md` on hover), `--entity-w` wide. The name is semibold, with an optional muted description under it, then a divider and one row per attribute. An attribute's note sits under its name in faint `--text-xs`. An entity with no attributes reads "No attributes". Selection adds an accent ring.
- **Floating edges** connect the facing sides of two cards: left/right when they're further apart horizontally than vertically, otherwise top/bottom. When the facing sides overlap, the ends meet in the middle of the shared span so the line runs straight. Otherwise each end sits at its side's midpoint, and the path steps orthogonally with rounded corners, keeping a straight stub at each end long enough for the markers.
- **Markers:** the symbol against the card is the maximum (a bar or a crow's foot), the one further out the minimum (a bar or a circle). The mapping and geometry live in `erd/markers.ts`, with tests. Marker geometry, like card size estimates, is in canvas units in TypeScript; CSS values still come from `tokens.css`.
- **Labels** sit beside the line, never on it: above a horizontal run, right of a vertical one. On a short edge, such as the notes fixture's 80-unit gap, a label on the line would hide a marker.
- **Parallel relationships** are offset 16 units apart along the sides, so each stays visible and clickable. It's the minimum needed for "render and stay selectable"; proper separation is still phase 5.
- **Self-relationships** draw as a square loop off the card's right side.

## 2026-10-05 — Phase 2 milestone 4: editing entities

### `useEditableDoc`

- Hosted in `Shell`, which needs `dirty` for Reload, close, view switch and the focus re-read. It's generic over `'erd' | 'flows'` and holds the working copy plus the on-disk document it came from. While dirty, the working copy wins. Once clean, a newer on-disk document takes over, unless its canonical text equals the working copy (typically our own save read back), in which case nothing re-renders.
- One write at a time. Edits made during a write keep the document dirty, and the next save picks them up.
- `flush()` resolves `true` only when everything is on disk. Close uses it: if the save fails, an in-app dialog asks before the edits are thrown away.
- Phase 1's `useDesign` keeps the previous document object when a re-read's canonical text is unchanged, so a focus re-read of an untouched file doesn't re-render the canvas.

### Editing on the card

- **Double-click to edit any text,** including attributes and notes, as the brief specifies for the name. A single click selects and drags the card.
- **Opening a name or attribute selects its text,** so typing replaces it. Opening a description or note puts the caret at the end.
- **Tab commits a field and moves to the next:** name → description → a new attribute at the end, and attribute → its note → a new attribute below it. Enter commits and closes, except on attribute names, where it continues. This is what makes "rename, describe, add three attributes using only the keyboard" possible: the brief's Enter-to-continue covers attributes but gives no keyboard route from the name to them.
- **New attribute rows are drafts until they have a name.** Nothing empty is ever written: Enter on an empty draft, Escape or clicking away just closes it.
- **Clearing an existing name doesn't delete anything.** An empty commit keeps the old entity or attribute name; deleting is the row's × button.
- **Hover controls:** each attribute row shows "note" (when it has none) and ×. The header shows "+ description" when there's none. These sit at the row's or header's right and take no space, so cards don't change size on hover.
- **New entities** are created centred on the point (the view's centre for Add entity and E, the pointer for double-click), with their name field focused and selected.

### Canvas mechanics

- **Measured sizes are kept and merged back into each node** (`canvas/useMeasurements`), and every node gets an initial size from `estimateEntitySize`. Without them, React Flow hides a node it thinks is unmeasured for a frame on every change. A double-click's second click then falls through to the pane, and a new card's name field can't take focus.
- **Positions computed for unpositioned entities are written with the first real edit** (`withPlacement`), as the brief describes. A no-op edit writes nothing.
- **Deletion goes through `onBeforeDelete`,** which asks when the delete cascades, applies `deleteEntities` and `deleteRelationships` itself, and returns `false` so React Flow doesn't remove anything a second time. Selected relationships are deleted with entities already, so milestone 5's multi-select delete only needs edge selection to work.
- **Double-click no longer zooms** on any canvas (`zoomOnDoubleClick` is off in `Canvas`); views use double-click to create things.

## 2026-10-05 — Phase 2 milestone 5: editing relationships

- **Connecting:** each card has a handle on each side, shown on hover or selection. A drag ends in `onConnectEnd`, which finds the entity under the pointer, so dropping anywhere on another card relates them (`from` is the card dragged from). `isValidConnection` is always false, so React Flow never makes a handle-to-handle connection of its own. Dropping on the same card or on empty canvas does nothing. The new relationship is selected, which opens its popover.
- **The popover opens when exactly one relationship, and nothing else, is selected.** It sits under the edge's midpoint and holds a native `<select>` per end (named after that end's entity, with options like "o< Zero or more"), the label (saved on Enter or blur, Escape restores it), Reverse direction and Delete. Each change applies and autosaves as it's made.
- **Selected ids that no longer exist are ignored,** so a relationship deleted from its popover can't stop the next one's popover from opening.
- **Multi-select delete** needs nothing new: `onBeforeDelete` already deletes selected entities and relationships together, and asks only when an entity cascades.

## 2026-10-05 — Phase 2 milestone 6: verification notes

- **An empty ERD shows 05's "No entities yet" card over the canvas, toolbar and save status included.** 04 draws the same empty canvas without the card; the two designs can't both hold, and 05 is the one about empty states.
- **Timings and canvas geometry in TypeScript:** the autosave delay (500 ms, from the brief), "Copied" feedback (1.5 s), card size estimates, marker geometry, corner radius and new-entity offset are behaviour and canvas units in `.ts` modules, not CSS values. Everything CSS draws comes from `tokens.css`.
- **Verified with simulated input, not a real trackpad:** scroll to pan (wheel), pinch to zoom (ctrl+wheel) and Shift-click (a synthesized Shift keydown; the browser tool's modifier flag alone doesn't produce one). These want a check by hand on a real trackpad and keyboard.

## 2026-10-06 — Phase 3 planning decisions

Settled in the phase 3 interview before any code was written. The brief's "Decisions this brief makes" stand, except where these change them.

### No confirmations on Flows deletes (supersedes brief §6)

Deleting screens, states, CTAs and transitions never asks, including when it cascades to transitions or retargets them. The cascades still happen exactly as the brief's table says. The ERD keeps its prompts.

**Why:** confirmations are a stopgap for missing undo, and undo is coming in phase 5. Two "done means" items change from "asks first" to "deletes without asking, and the file validates". With nothing to word, there's no flows `deletion.ts`, and `erd/deletion.ts` stays in `erd/`.

### "Make default" follows the default

A transition without `stateId` targets whichever state is first. After "make default" it points at the new default, and nothing in the file is rewritten. This matches the schema's meaning of an omitted `stateId`, and `deleteState`'s retargeting relies on the same rule.

### Tab path through a screen card

name → notes → the first state's sees items in order. Tab on the last sees item, or on an empty sees draft, opens the first CTA (or a new CTA draft). CTAs go in order, then to the next state's name in a multi-state screen. Tab after the last field ends editing. Enter continues within a list, and Enter on an empty draft ends entry. This gives the "type, Enter, type, Enter" route from sees items to CTAs that the brief needs.

### A new state copies the default state's sees items

It's named "State", has no CTAs, is inserted after the state it was added from (at the end from the card's "+ add state"), and opens with its name selected. States usually differ from the default by an item or two, such as Error adding "error message".

### Dropping a CTA on its own card

Dropping on the CTA's own screen, anywhere outside a state header, makes a same-screen transition to the default state (no `stateId`), e.g. Error › "Try again" → Login. It does nothing only when the target would be the CTA's own state: its own state header, or anywhere on the card when the CTA sits in the default state.

### Flows empty state gets its button (supersedes the phase 2 entry)

The phase 2 entry left 05's "Add screen S" button off because adding screens didn't work yet. Now that S works, the button follows 05.

## 2026-10-06 — Phase 3 milestone 0: shared pieces promoted out of `erd/`

- `editing/InlineField.tsx`: moved unchanged.
- `editing/ids.ts`: `newId(prefix, existing, random?)` over every prefix (`ent`, `attr`, `rel`, `scr`, `st`, `cta`, `tr`), with the same alphabet, length and collision retry. Each document's `idsIn` stays with its own editor.
- `canvas/placement.ts`: `placeNodes(nodes, layout, sizeOf)`, the phase 2 algorithm over any node with an id. `erd/placement.ts` keeps `placeEntities` as a one-line wrapper.
- `canvas/edgeGeometry.ts`: `Side`, `Rect`, `Point`, `sideAngle`, `CORNER_RADIUS`, `fanOffsets` (the general form of parallel offsets) and `orthogonalPath`, a rounded-corner path through waypoints. `floatingEnds` is crow's-foot-specific in practice (ends float to facing sides), so it stays in `erd/`, and `parallelOffsets` becomes a wrapper over `fanOffsets`. The ERD still draws with React Flow's `getSmoothStepPath`, so its edges are unchanged. Flows routes through `orthogonalPath`, because it needs waypoints that go around cards.
- `editing/editor.ts`: `DocEditor<Doc, Target>`, `createEditorContext` and `isEditingTarget` (every key matches, except `selectAll`). `erd/editor.ts` keeps `EditTarget`, `isEditing` and `useErdEditor` as thin instantiations.
- `erd/deletion.ts` stays put, since Flows deletes don't ask.

## 2026-10-06 — Phase 3 milestone 1: flows canvas foundation

- **`Shell` hosts two independent `useEditableDoc`s.** Switching views flushes only the one being left. The focus re-read waits while either is dirty. Reload asks if either is dirty and names which ("ERD and Flows"), then discards both. Close flushes both and names whichever failed.
- **`FlowsView` mirrors `ErdView`:** the shared `Canvas`, `useSelection`, `useMeasurements` and `withPlacement` (via `placeNodes` and `estimateScreenSize`), with viewport key `flows:<path>`. `addScreen` and `moveScreens` land in `flows/ops.ts` now, because the toolbar and drag need them. The rest of the operations follow in milestone 2.
- **`--screen-w` is 260px,** 20 wider than an entity, to fit a CTA row with its handle. `SCREEN_WIDTH` in `flows/metrics.ts` must agree with it.

## 2026-10-06 — Phase 3 milestone 2: flow operations

These follow the phase 2 conventions. Calls the brief left open:

- **Sees items and CTAs take an optional initial text** (`addSeesItem(…, afterIndex?, text = '')`, `addCta(…, afterCtaId?, label = '')`), so the editor writes a draft once, with its text, rather than adding an empty item and then updating it. With no text they add an empty item, as `addAttribute` does.
- **An unknown `after` position appends.** `afterStateId`, `afterIndex` and `afterCtaId` are placement hints; a missing state or screen is still a no-op.
- **`addTransition` refuses missing ends** (`id: null`, same document): an unknown CTA, screen, or a `stateId` not on the target screen. It doesn't refuse a CTA's own state; that's the canvas's rule (decision "Dropping a CTA on its own card"), not the document's.
- **`updateTransition(flows, id, { label?, stateId? })`:** `stateId: null` targets the default by removing the key, and a state that isn't on the target screen is ignored. Changing the target screen isn't offered.
- **Deleting a default state** makes the next state the default, and transitions into it are retargeted to that new default.

## 2026-10-06 — Phase 3 milestone 3: screen card and transition edges

There's no phase 3 design, so both are built from tokens in the entity card's language, to be judged at the gate.

- **Card:** the entity card's surface, radius, shadow and selection ring, `--screen-w` wide. The header holds the semibold name, with optional notes as a muted line. Each state body has a faint "Sees" caption over dash-marked muted items, and a "Does" caption over CTA rows drawn as small outlined lo-fi buttons. An empty list reads "Nothing yet". Multi-state screens give each state a sunken header row (`--state-head-h`) with its name, and a "default" tag in accent on the first.
- **Handles:** each CTA row has a source handle on the card's right edge, hollow (faint ring) with no transitions and filled (muted) with one or more. Target handles on the screen header and on shown state headers are invisible anchors; the arrowhead marks the target.
- **Endpoints** (`flows/endpoints.ts`, pure and tested): the source handle is `cta:<stateId>:<ctaId>`, since CTA ids are only unique per state. The target is `state:<stateId>` when `to.stateId` is set and the screen shows state headers, otherwise `screen`.
- **Routing** (`flows/route.ts`, pure and tested) goes from the source card's right edge to the target card's left edge, with a 20-unit stub at each end and an 8-unit filled arrowhead.
  - **Forward:** when there's room between the cards, the path jogs once in the middle.
  - **Otherwise (backward edges and same-screen loops):** the path goes out past the right of both cards, along a lane, and back in from the left of both. The lane runs through the gap between stacked cards when there's room, otherwise round the top or bottom, whichever is shorter. So a loop never crosses its own card.
  - **Fan-out:** transitions from one CTA fan out 12 units apart at their first turn.
  - **Tracks:** each screen's outgoing transitions get their own track, 8 units further out per track, so several loops round one card don't overlap.
- **Labels** sit above the middle of the path's longest horizontal run, beside the line, as on the ERD.
- **Generic canvas CSS moved to `canvas/canvas.css`:** `.anchor-handle`, `.edge-label`, `.canvas-host`, `.editable`, `.inline-input`, the popover field styles and the toolbar "+" button. These sat in `erd.css` but both views use them. The selectors are unchanged and load in the same order, so the ERD looks the same.
- **Not done (out of scope):** routing around cards other than the transition's own two. A long backward edge can cross unrelated cards.

## 2026-10-06 — Phase 3 milestone 4: editing screens

- **Hover controls take no space,** as on the ERD. The screen header shows "+ notes" (when there are none) and "+ state" at its right. A state header shows "make default" (except on the first) and ×. Each sees item and CTA row shows ×. A single-state screen has no state header, so its last state can't be deleted from the UI.
- **"+ state" sits in the screen header** for single- and multi-state screens alike. It appends a state and opens its name, selected.
- **Each list ends in an always-visible "+ Add item" / "+ Add CTA" row,** like the ERD's "+ Add attribute". It replaces the read-only "Nothing yet".
- **Clearing an existing sees item, CTA, state or screen name doesn't delete it:** an empty commit keeps the old text, and × deletes.
- **Tab order** lives in `flows/tabOrder.ts` (pure, tested) and follows the planning decision. Name → notes skips the first state's name and goes straight to its sees items, as the brief orders it. Later states are entered at their name.
- **Screen delete** (Delete or Backspace on a selection) goes through `onBeforeDelete`, which applies `deleteScreens` and `deleteTransitions` without asking.

## 2026-10-06 — Phase 3 milestone 5: editing transitions

- **Connecting** follows the ERD pattern: `onConnectEnd` looks under the pointer for a `[data-state-header]` and a card (`.react-flow__node`), and `isValidConnection` is always false. The CTA is found from the drag's source handle by matching every CTA's handle id (`flows/connect.ts`), rather than by parsing the id: schema ids may contain any character. The drop rules are pure and tested (`dropTarget`). While a drag is in progress, hovering a header outlines it in accent, so you can see what you'll target.
- **Popover:** a read-only "From", a "To" select ("<Screen> (default state)" omits `stateId`; then "<Screen> › <State>" for every state, including the first), the label (Enter or blur saves, Escape restores), and Delete. `LabelField` moved to `editing/` and is shared with the ERD popover, unchanged.
- **Fan-out (supersedes milestone 3's 12-unit offsets):** transitions from one CTA turn at their own column, 12 units apart going out from the CTA. Loops in the group turn at their column too, once past both cards. With centred offsets, a forward edge and a loop from the same CTA could end up 2 units apart and overlap.

## 2026-10-06 — Phase 3 milestone 6: verification notes

Walked the "done means" list by hand in the browser against scratch copies of the notes fixture, an empty project and a project with an unpositioned screen. Every item passed, with the two "asks first" items now reading "deletes without asking" (planning decision). One bug turned up during the walk and was fixed before milestone 4's commit: new screens didn't open their name field.

- **Verified with simulated input:** Shift-click (a synthesized Shift keydown, as in phase 2), and drags in a small browser pane, with positions taken from the DOM. They want a check by hand on a real trackpad and keyboard.
- **Not fixed, outside this phase's scope: a phase 2 `useEditableDoc` bug.** After an edit has saved, if `flows.json` (or `erd.json`) on disk is reverted to exactly its pre-edit text, Reload keeps showing the edited copy. The re-read hands back the same document object the working copy was based on, so the hook can't tell anything changed. Reopening the project shows the file correctly. Editing a file by hand to anything else works as intended.

## 2026-10-06 — Phase 4 milestone 0: the `useEditableDoc` revert fix

- **Cause:** after a save, `useDesign` still held the pre-edit document, because nothing had re-read the file. Reverting the file to that exact text and pressing Reload made `useDesign` keep that same object, and the hook's "the on-disk document hasn't changed since my edit" identity check let the edited copy win.
- **Fix, in two parts:**
  - `useDesign.noteWritten(kind, doc)` records each successful save, so the on-disk state stays true to the file without a re-read. A re-read already in flight keeps the written document for that file rather than its own possibly-older result.
  - Once clean, `useEditableDoc` compares canonical text and never identity. A different on-disk text always takes over. The same text keeps the working copy's object, so nothing re-renders. The working copy's `base` is gone.
- **Testable state:** the state logic now lives in `editing/editableState.ts` (pure, tested), and `DocState` with `keepUnchanged` in `docState.ts`. The hook is a thin shell over them. The regression test drives both together, as `Shell` does.
- **Verified by hand** on ERD and Flows: edit, revert the file with git, Reload shows the reverted text, and a further edit saves.

## 2026-10-06 — Phase 4 planning decisions

Settled in the phase 4 interview before any code was written. The brief's "Decisions this brief makes" all stand as written: modelwright never runs the dev server; one editing path for all three files; no schema change; one guarded endpoint that returns no bodies; the preview never shares the tool's origin; device switching resizes without remounting, and the iframe stays mounted across view switches; scale down to fit, never up; a device without a height fills the available height; poll only while "Nothing running" and visible. These sharpen them:

- **Showing the UI view re-checks, but keeps the iframe.** While that check runs, the preview stays as it is. The state changes only if the result isn't `ok`, so a dev server that stopped while you were in the ERD is noticed when you come back. There's still no background polling once the preview is up.
- **`frame-ancestors` beats `X-Frame-Options`, as in browsers.** When an enforced CSP header has a `frame-ancestors` directive, that decides, and XFO is ignored. Otherwise XFO `DENY` or `SAMEORIGIN` refuses. Report-only CSP is ignored, and every enforced CSP header has to allow the tool. Classifying by the brief's letter would report "refuses embedding" for a page the iframe actually shows.
- **Odd failures are `unreachable` with a specific detail:** too many redirects (more than 5) and a TLS certificate Node doesn't trust. The "Nothing running" card shows the detail and keeps polling. The four statuses stay as the brief has them.
- **The URL can be edited from the "Nothing running" and "Refuses embedding" cards too** (double-click, same validation), so a wrong port doesn't need a hand edit of `config.json`.
- **The tool's own address** is ports 4300 and 4301 on any loopback host (`localhost`, `*.localhost`, `127.0.0.0/8`, `[::1]`, `[::]`, `0.0.0.0`, IPv4-mapped loopback), plus the exact origin the page is served from. The same ports on another machine are allowed.
- **Smaller calls:**
  - `devices: []` falls back to the presets. With a single device there's no toggle, just its size.
  - Devices narrower than 768 get a phone-like frame; wider ones get a window frame.
  - "Checking" shows only once a check has taken about 300 ms.
  - Reload preview re-navigates the iframe to the configured URL. It's cross-origin, so the tool can't reload the app's current route.
  - The No-URL card replaces 05's JSON snippet and its Reload button with the URL field, "Set preview URL" and a line saying where the URL is saved. The header still has Reload.
- **Not changed:** the untracked `docs/CLAUDE.md` (a stale copy of the root file) is left alone.

## 2026-10-06 — Phase 4 milestone 1: config editing

- **`useEditableDoc` covers `config`.** `Shell` hosts a third editor. The focus re-read waits while any of the three is dirty. Reload's prompt and close's failure message name it "UI" (via a small `listed()` helper: "ERD, Flows and UI").
- **The header's name edit goes through it,** with `saveNow`. The recents entry is still renamed by the server on `PUT config`, so the header no longer re-reads the files after a rename. A failed config save, from the name or the URL, shows "Couldn’t save — retry" beside the name in the header, which is always visible, rather than beside whichever field made the edit.
- **A blank project name is refused by `renameProject`** (same object back), because the schema requires one. The header still says "Name can’t be empty".
- **URL rules** (`preview/url.ts`) prefix a bare host, with or without port and path (`localhost`, `localhost:5173/app`, `[::1]:3000`), with `http://`. The URL is saved exactly as entered (no trailing slash from `URL.href`). A stored URL is checked without prefixing, so a hand-edited `localhost:5173` shows the invalid-URL state, with the fix one Enter away in its field.
- **`UrlField`** is the single input for preview URLs. `FieldError` moved from the picker to `ui.tsx` so both share it.

## 2026-10-06 — Phase 4 milestone 2: preview check

- **`POST /api/preview/check`** takes `{ url }` and returns `PreviewCheck` (`packages/schema/src/api.ts`, an API shape, so no `schemaVersion` bump). It sits behind the existing guard and reads no files.
- **The request:**
  - It's a GET with `redirect: 'manual'`, following redirects itself so each hop is validated. A redirect to a non-http(s) URL or to the tool counts as `invalid`, and more than 5 redirects as `unreachable`.
  - One 3-second deadline covers the whole check, redirects included.
  - Every response body is cancelled unread. The detail is one of a fixed set of messages or the refusing header's value (clipped to 160 characters), never an error message or body text.
- **The tool's origin** for `frame-ancestors` is the request's `Origin` (the address you're actually using), or `http://localhost:4300` when there's none (curl, tests).
- **`frame-ancestors` matching** (`frameHeaders.ts`) covers:
  - `'none'` (ignored beside other sources, per the spec), `'self'` and `*`
  - scheme sources, with `http:` also matching `https`
  - host sources with optional scheme, `*.` subdomain wildcards, explicit or `*` ports, and default ports when the port is omitted
  - Nonces, hashes and other keywords never match.
- **The URL rule is duplicated on the server** (absolute http(s), not loopback on 4300/4301, not the request's origin), because the server can't import `apps/web`. Both copies point at each other.
- **Failure details:** "Connection refused", "Host not found", "No response within 3 s — it may still be starting", "Certificate not trusted (<code>)", "Too many redirects (more than 5)", otherwise "Couldn’t connect (<code>)".

## 2026-10-06 — Phase 4 milestone 3: preview pane and states

There's no phase 4 design, so all of this is built from tokens in the existing language and judged at the gate.

- **The toolbar shows only with a preview.** The other states are 05-style cards, without a toolbar.
- **Toolbar layout:** the device toggle (`.segmented`, as in the header), the size and a "74%" scale readout on the left. The URL (double-click to edit), Reload preview and Open in browser are on the right. With a single device, it shows the device's name and size instead of a one-segment toggle.
- **Device frame:**
  - Narrow devices (under 768) get a light, phone-like bezel (`--device-bezel`, `--device-radius`, `--device-screen-radius`). Wide ones get a window with a sunken title bar and three dots (`--window-bar-h`, `--window-dot`).
  - Both share one element tree, with the bar hidden on phones, so switching between them only restyles and never remounts the iframe.
  - `DeviceFrame` reads the bezel and bar sizes from `tokens.css` at runtime to work out the scale.
- **Scale-to-fit** applies a CSS transform to the whole frame inside a slot sized to the scaled result, so the frame stays centred. The iframe keeps its device-width viewport. A ResizeObserver on the stage drives it.
- **Open in browser is a link** (`<a target="_blank" rel="noopener noreferrer">` styled as a button), not script. A zero-specificity `:where(a.btn)` reset keeps each button variant's colour.
- **Cards:**
  - UI-view cards are `--state-card-w` (360) wide, so URLs and the field fit.
  - "Nothing running" shows the URL (editable), the failure detail, "Start your project’s dev server", `devCommand` with Copy, and "Checking again…".
  - "Refuses embedding" shows the header and value, what it means, how to allow the tool's origin, and Open in browser.
  - "Invalid URL" shows the problem and the field. Saving it blank clears the URL. A server-side `invalid` (say, a redirect to the tool) uses the same card with the server's detail.
- **Fix found at the gate: a clean working copy no longer outlives an invalid file.** With `config.json` broken by hand, the header still offered the stale copy's name for editing, and a rename would have overwritten the broken file. `resolveDoc` now returns nothing to edit when the file is clean and missing or invalid on disk. Unsaved edits still win, as before.

## 2026-10-06 — Phase 4 milestone 4: behaviour

- **Polling** runs one check 3 seconds after each result while the result is `unreachable`, the UI view is visible and the window has focus. Chaining after each result, rather than a fixed interval, means a check that waits out its 3-second timeout never overlaps the next. Focus is tracked from `focus` and `blur` events, starting from `document.hasFocus()`. Clicking into the preview iframe blurs the window, but there's no iframe while "Nothing running", so that never pauses polling that's needed.
- **The UI view stays mounted** once visited: `Shell` renders it with `hidden` while another view shows. ERD and Flows still unmount as before. Showing it again re-checks, keeping the iframe up unless the result isn't `ok`.
- **A hidden frame keeps its last size.** The stage reports 0×0 while hidden. Without ignoring that, the app would be resized to a 1-pixel viewport every time you switched away.
- **Device memory** is `loadPref`/`savePref('preview-device:<projectPath>')`, so it's stored as `modelwright.preview-device:<path>` like every other preference. A remembered device that's no longer in the list falls back to the first.
- **Toolbar in narrow windows:** the left group keeps its size, the URL truncates first, and the buttons run off the right edge rather than overlapping. They're right-aligned by an auto margin, because `justify-content: flex-end` spills overflow to the left.
- **Verified in the browser:**
  - Polling at about 3 s.
  - The preview appears on its own when the Vite app starts.
  - No checks while hidden or blurred.
  - The same iframe element, with no reload and typed text intact, across ERD and back.
  - The device remembered across a page reload.
  - Reload preview loads the iframe once more, and the header Reload doesn't touch it.
  - Blur and focus were simulated with window events.

## 2026-10-06 — Phase 4 milestone 5: verification notes

Walked the "done means" list by hand in the browser, against a scratch copy of the notes fixture, a throwaway Vite app on 5173 and an `X-Frame-Options: DENY` server on 5174. All three live in the session scratchpad, not this repo. Every item passed:

- **Checks:** `pnpm test` (430 tests), `pnpm typecheck` and `pnpm lint` pass at the root.
- **Revert fix:** reverting `erd.json`, `flows.json` and (in the final walk) `config.json` to their pre-edit text and pressing Reload shows the reverted content. Editing afterwards still saves.
- **Rename:** the header rename saves through the shared editor, and the recents entry updates.
- **Setting and clearing the URL:**
  - `localhost:5173` typed into the No-URL card is saved as `http://localhost:5173`.
  - Clearing the URL from the toolbar, or from the Invalid-URL card, removes the key.
  - `devCommand` and a five-device `devices` list are untouched.
  - `localhost:4300` is refused: "That’s modelwright’s own address…"
- **Nothing running:** the state shows `devCommand`, polls about every 3 s, and the preview appeared on its own when the Vite app started.
- **Refuses embedding:** the DENY server shows that state and names `X-Frame-Options: DENY`. Open in browser is a link with the right href and `target="_blank" rel="noopener noreferrer"`. The browser pane can't open new windows, so it opened in place; a normal browser opens a new tab.
- **Devices and scaling:**
  - Mobile is 390 wide with the mobile layout, and Desktop is 1280 with the desktop layout. Text typed in the app survives switching between them.
  - Desktop at 1000 px wide scales to 74% and shows it. At 1440 it stays at 100%.
- **Mounting:** switching to ERD and back keeps the same iframe element with no new load.
- **Custom devices** replace the presets. Phone 375 × 667 uses its height, and Wide (1440, no height) fills the stage exactly. Five devices turn the toggle into a select. A remembered device that no longer exists falls back to the first.
- **Device memory:** the chosen device survives a page reload, stored per project.
- **Reloads:** Reload preview reloads only the iframe, and the header Reload doesn't touch it.
- **Bad config:** `"url": "ftp://x"` shows the Invalid-URL state. A `config.json` with an unknown key shows the validation surface with a warning dot on UI, and the name is read-only. ERD and Flows still render.

Caveats:
- **Verified with simulated input:** window blur and focus (synthetic events), and clicks in a small browser pane, with positions taken from the DOM.
- **Gate screenshots are downscaled:** the 1440×900 shots are 800×500 renders, the browser tool's maximum.

## 2026-10-06 — Phase 5 planning decisions

Settled in the phase 5 interview before any code was written. The brief's "Decisions this brief makes" all stand: per-document undo for ERD and Flows, one committed edit per step, cleared when disk replaces the working copy; undo toasts instead of delete confirmations; one shortcut registry; the proposed shortcut set; ⌥↑/⌥↓ reordering; duplicate copies internal links only; file watching replaces "last writer wins"; `spec.md` written by the server on every successful save, never on open; dark mode through tokens only, System by default. These sharpen them:

- **Spec, data model:** the Mermaid `erDiagram` leaves attributes out. They're in the per-entity tables, so the diagram doesn't imply types the conceptual ERD doesn't have.
- **Spec, relationship sentences:** the label is the forward verb ("Each User owns zero or more Notes."), "has" when there's no label, and "belongs to" in reverse ("Each Note belongs to exactly one User.").
- **Spec, plurals:** simple English rules (s, es, y → ies) on a name's last word, plus a short irregular list.
- **Selection after undo/redo:** a pure before/after diff selects whatever the step touched that still exists. A change inside a card (attribute, sees item, CTA, state) selects the card.
- **The shortcuts overlay** also lists Delete/⌫ and Esc, and a "While editing" group (Enter, Tab, Esc, ⌥↑/⌥↓, native ⌘Z).
- **Zoom keys** accept `+` or `=`, and `−` or `-`, unmodified. ⌘+ and ⌘− stay the browser's page zoom. ⇧0, like ⇧1, matches the physical key.
- **⌘D has no fallback.** If a browser wins it, it's dropped from the web build and logged for Electron.
- **Browser-conflict checks are done by hand at the end** (milestone 6), not at milestone 1. Simulated keys skip the browser's own shortcut handling (the ⌘R lesson), so only a person at a real keyboard can check them.
- **The theme control** is one icon button in the header that opens a System/Light/Dark menu.
- **config.json conflicts** use the same banner as the canvases, shown on the UI view.
- **The spec review** uses a local page that renders Mermaid, not a gist, so nothing is published.

## 2026-10-06 — Phase 5 milestone 0: undo, redo and the toast

- **History** is pure (`editing/history.ts`) and lives in `EditableState` beside the working copy. `applyEdit(state, shown, next)` records `shown`, the document on screen before the edit, so the first edit on a freshly opened file is undoable too.
- **History belongs to the working copy.** `historyFor(state, shown)` is empty whenever the document shown isn't the working copy, which is exactly when disk has replaced it (Reload, an external change, a reopen). There's no separate "clear" call to forget, and our own save read back keeps the history.
- **Undo and redo are ordinary edits** for saving: they make the document dirty and autosave after the usual pause. Each bumps a `revision` counter, as an edit does.
- **Coalescing:** an edit with a `coalesce` key within 600 ms of the last one with the same key joins that step. Nudging uses it in milestone 1. An undo always ends coalescing.
- **The touched diff** compares items by id and canonical JSON, with their layout entry (`editing/touched.ts`, one file for both documents).
- **Deletes:** every delete applies at once and shows a toast with Undo, from the canvas (Delete/⌫), the popovers and the cards' × buttons. `erd/deletion.ts` now words what went ("Deleted 'User', 2 attributes and 1 relationship"), and `flows/deletion.ts` does the same for screens, states, sees items, CTAs and transitions. `deletionPrompt` and the ERD's confirmation are gone. `ConfirmDialog` stays for Reload and close.
- **The toast** (`Toast.tsx`) is one message at a time, hosted by `Shell` in the view area, centred 72 px above the bottom edge (`--toast-offset`), clear of the canvas toolbar and the save status. It dismisses itself after 6 s, on the next edit of the document it's about (its revision moved on), and on a view switch. Its Undo is the same as ⌘Z, selection included.
- **⌘Z / ⇧⌘Z** (Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y off macOS) skip text fields, so a field keeps its own native undo.

## 2026-10-06 — Phase 5 milestone 1: shortcuts

- **The registry** (`shortcutRegistry.ts`) lists every shortcut with its key combinations, label and scope (Anywhere, ERD and Flows, ERD, Flows, While editing a field). `useShortcut(id, handler)` matches through it. `shortcutHint(id)` renders the hints (⇧⌘Z on macOS, Ctrl+Shift+Z elsewhere). React Flow's delete keys come from it, and the overlay is generated from it.
- **A control's own keys aren't app shortcuts.** The project picker's ↑ ↓ ↵ and the dialogs' ↵ and esc stay local (`useKeydown`), like a text field's keys. The overlay only exists inside a project, where they don't apply.
- **Matching:**
  - The command modifier is ⌘ on macOS and Ctrl elsewhere. Holding the other one never matches.
  - 1/2/3, ⇧0 and ⇧1 match the physical key, so they work on layouts where those keys type other characters (AZERTY's 1 is "&").
  - `?`, `+` and `=` accept Shift either way, because the layout decides whether Shift is needed.
  - Tests check that no key has two shortcuts in scopes that can be active together, on either platform.
- **Duplicate:**
  - Copies keep their names and sit 16 units (one grid step) down and right.
  - The copies and the links copied between them are selected.
  - Every id is fresh, including attributes, states and CTAs, following "new ids are unique across the whole file".
  - The brief says both "relationships or transitions between duplicated nodes are duplicated" and "a duplicated screen's CTAs start with no outgoing transitions". Done-means asks for two connected screens to keep their link, so a copied CTA keeps only transitions whose target screen was copied too, retargeted to the copy and its matching state.
- **Nudge:** a burst of arrow keydowns shares one coalesce key until an arrow key's keyup, and coalescing also ends after a 600 ms pause. A held key is therefore one undo step, and the 500 ms autosave pause makes it one save. Separate presses are separate steps.
- **Zoom keys** use React Flow's animated zoom. ⇧0 is `zoomTo(1)` around the viewport centre.
- **The overlay** opens with `?` or the header's "?" button. While it's open it takes every key in the capture phase, so nothing behind it reacts. Esc, `?`, × or a click outside closes it.
- **⌥↑/⌥↓** save the field's text, then move the row (two undo steps when the text changed, one otherwise). The field stays open on the moved row. `InlineField` ignores the blur a DOM move can cause, refocuses if it lost focus, and stays usable after a move at the end of the list, which changes nothing.
- **Fix found while verifying: an untouched draft follows its value.** React Flow hands node data to nodes a render after the editor context changes. After ⌥↑ on a sees item (rows keyed by index), the field reopened on the new row with the previous item's text, and a second ⌥↑ saved that stale text over the moved item. `InlineField` now adopts a changed `value` until the user has typed.
- **Not checked yet: browser conflicts.** Simulated keys skip the browser's own handling, so ⌘D, ⌘A, ⌘Z/⇧⌘Z, +/−, ⇧0, 1/2/3, ?, ⌥↑/⌥↓ and the arrows are on the milestone 6 hand-check list for Chrome and Safari. Anything a browser wins is dropped then.

## 2026-10-06 — Phase 5 milestone 2: parallel relationships (supersedes phase 2's 16-unit offsets)

- **Groups:** `parallelSlots` gives each relationship its place among those joining the same pair of entities, in either direction and in document order. Self-relationships group per entity.
- **Spread:** `parallelRoute` spaces a group evenly, centred on the span the facing sides share (or the shorter side), using that room up to 40 units apart.
  - The minimum is 28 between horizontal lines, enough for each line's label above it clear of the next line.
  - The minimum is 24 between vertical lines, enough for the 14-unit markers. Their labels, beside the lines, are staggered 20 units apart vertically.
  - Lines that can't run straight step at nested positions (`centerX`/`centerY`), so their middle runs never cross. Phase 2's fixed offsets put every stepped path's middle run on the same line.
- **Self-relationships:**
  - They nest: each loop's ends sit 24 further from the side's middle, and the loop reaches 24 further out, leaving room for the inner loop's label clear of the outer loop.
  - `selfLoopSide` picks the side with the most room before another card (ties go right, bottom, left, top), from the same size estimates placement uses. A card's loops share one side.
  - This isn't routing around cards, which stays out of scope. It only chooses where a card's own loops go, because always looping right ran straight through a neighbour 80 units away, as in the notes fixture.
- **Labels** can now sit above, right of, or below their anchor (`below` for loops under a card).
- **Selection** is unchanged: each relationship keeps its own 16-unit interaction path, so every line in a group stays individually clickable.
- `fanOffsets` had no users left, so it's gone.

## 2026-10-06 — Phase 5 milestone 3: file watching (supersedes "External edits while dirty: last writer wins")

- **Server:**
  - `DesignWatcher` keeps one `fs.watch` on `<project>/.design/` per project, shared by its subscribers and closed when the last one leaves.
  - It looks only at `erd.json`, `flows.json` and `config.json`, so `spec.md`, editor temp files and everything else are ignored.
  - Changes are debounced per file (150 ms), then the file is read.
  - A change is reported only when the content differs both from the server's own last write to that file and from what was last reported. The server records each write (`noteWrite`) before making it, from `PUT` and from `init`, so its own saves never echo back, whatever the timing.
- **`GET /api/design/events?path=`** is a Server-Sent Events stream behind the same guard:
  - It sends `ready` once watching has started, then `change` with `{"kind":"erd"}`.
  - A comment every 25 s keeps proxies from closing an idle stream.
  - It answers 409 for a folder that isn't initialised.
- **`ProjectClient.watchDesign(path, onChange)`** uses `EventSource` in the HTTP client, which reconnects by itself if the server restarts.
- **Web, clean document:** `useDesign.reloadOne(kind)` re-reads just that file, exactly as a focus re-read would. The working copy is replaced, so its undo history goes with it (`historyFor`).
- **Web, dirty document:**
  - `hold()` puts saving on hold (`held`, status `held`, "Save on hold" in the pill). Edits keep applying locally.
  - A banner at the top of that file's view says "<file>.json was changed outside modelwright", with **Load from disk** (discard the edits and history, then re-read) and **Keep mine** (end the hold and save at once, overwriting the file).
  - For `config.json` the banner is on the UI view, and the header's project name can't be edited while it's held, since the banner may not be in view.
- **A save already in flight when the hold starts still lands.** The PUT has gone, and its content becomes the file. The hold stays until a choice is made, so the banner never disappears without one, and Load from disk then shows what's really on disk.
- **The focus re-read stays** as a fallback, still paused while anything is dirty.

## 2026-10-06 — Phase 5 milestone 4: the generated spec

- **`packages/spec`** (TypeScript source, like the schema package) exports:
  - `renderSpec(config, erd, flows)`
  - `erdMermaid` and `flowsMermaid` for Copy Mermaid
  - `relationshipSentences` and `plural`
  Output follows document order and nothing else, so it's byte-identical for the same input.
- **Layout of `spec.md`:**
  - The header line, as a blockquote.
  - `# <project name>`.
  - `## Data model`: the diagram, then `### Entities` (an `####` and table per entity, its description above the table, "No attributes." when empty), then `### Relationships` (one bullet of sentences each).
  - `## Screens and flows`: the diagram, then an `###` per screen with its notes and a "Uses:" line naming its `entities`. Each state has an `####` (single-state screens skip it, and the first state is marked "(default)"), followed by "Sees:" and "Does:" lists.
  - `## Preview`: URL, dev command and devices, when set.
  - Empty documents say "No entities yet." or "No screens yet." and draw no diagram.
- **Where a CTA leads** reads "→ Screen › State (transition label)". Several transitions are separated by "; ". The state is left out for single-state screens, where it's always "Default" and adds nothing. A CTA with no transition is "(dead end)".
- **The "Uses:" line** isn't in the brief's list. It's the only place a screen's `entities` cross-reference would otherwise be visible, and phase 6 will want it. Flagged for the review gate.
- **Mermaid:**
  - Identifiers are `e_`/`s_` plus the schema id with anything outside `[A-Za-z0-9_]` turned into `_`, plus `_2`, `_3`… on collision. The prefix keeps them clear of keywords like `end`, and of `o`/`x` edge syntax.
  - Names are quoted labels, with `"` as `#quot;`.
  - Multi-state screens are subgraphs of state nodes. A transition with no `stateId` points at the default state's node. Edge labels are the CTA's label, then ": transition label".
- **Mermaid's own parser runs in the tests** (`mermaid` with jsdom, as dev dependencies of `packages/spec`). The golden diagrams and every cardinality pair are parsed. The review page renders with Mermaid 11 from a CDN, and both the notes and busy examples draw.
- **Plurals:**
  - Acronyms take a lower-case s (SKUs).
  - A trailing parenthetical is skipped ("Orders (v2)").
  - A short list of irregular and unchanging words applies (people, children, data, settings…).
- **Golden files** live in `packages/spec/test/golden/`, are rewritten with `UPDATE_GOLDEN=1`, and are excluded from Prettier because they're compared byte for byte. The busy example's fixture is canonical serialiser output, like the notes fixture.
- **Server:**
  - `regenerateSpec` runs after a successful `PUT` of any design file and after `init`, only when all three files parse.
  - It writes atomically, and skips the write when the text is unchanged.
  - `specFile` is the one new writable path, checked to sit directly in `.design/`.
  - A failure to write the spec is logged, not returned as an error, because the design file is already saved.
  - The watcher already ignores `spec.md`.
- **Copy Mermaid** is a toolbar button on each canvas, with a "Mermaid copied" toast (or "Couldn’t copy to the clipboard").
- **Fix found while verifying (milestone 1): React Flow's keyboard handling is off** (`disableKeyboardA11y`). With a node focused after a click, React Flow handled the arrow keys itself, and the registry's nudge never saw them. The milestone 1 check had dispatched keys to the page body, which missed this.

## 2026-10-06 — Phase 5 milestone 5: dark mode

- **Light mode now meets WCAG AA, which moves three values off the design-refs** (settled with you at this milestone: the refs' faint text fails AA):
  - `--color-text-faint` goes from #9b9b95 (2.6:1) to #6c6c66 (4.5:1 on the sunken background, where the picker and state headers use it). It's now close to `--color-text-muted`, so the hierarchy leans more on size and placement.
  - `--color-on-accent-muted` (the key hint in a primary button) goes from #c9d0f5 (4.06:1) to #dde2fa.
  - New `--color-border-input` (#8a8a84 light, #6a6a65 dark) gives text fields and selects a 3:1 edge. `--color-border-strong` stays as it was for decorative edges (secondary buttons, CTA chips, the device frame).
- **The dark theme lives in tokens only:**
  - A `[data-theme='dark']` block, and an identical one under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme='light'])`.
  - It covers every colour token and the three shadows (dark shadows add a faint light ring so cards keep an edge), plus `color-scheme`, so native selects, inputs and scrollbars match.
  - No component has a dark-mode rule, and no colour existed outside `tokens.css` to begin with.
  - Values are derived from the light palette (the same warm greys, inverted) with the accent lifted to #7385f2. Text on the accent is dark (#11152b), because white on a lifted accent can't reach 4.5:1.
- **`test/tokens.test.ts`:**
  - Both dark blocks must be identical, and must cover exactly the colour and shadow tokens.
  - Every text pairing the UI uses must reach 4.5:1 in both themes, and text-field edges 3:1. Faint text is never checked against the hover background, because every hovered control switches to full text colour.
  - The dot grid and card borders are decorative and not held to a ratio. The dot grid is 1.36:1 in light and about 1.5:1 in dark.
- **Theme setting** (`theme.ts`):
  - System (default), Light or Dark, saved as `modelwright.theme` (System removes the key).
  - Light and Dark set `data-theme` on `<html>`. System sets nothing and lets the media query follow the OS live, with no script.
  - An inline script in `index.html` applies a saved theme before first paint.
  - The header control is one icon button (◐ ☀ ☾) with a three-item menu, closed by Esc or a click outside.
- **Canvas colours** (dot grid, edges, markers, handles) were already drawn by CSS from tokens, so nothing in JavaScript needs re-reading on a theme change.
- **The preview iframe isn't themed.** It gets `color-scheme: light dark`, so the app inside sees the OS's light or dark preference rather than modelwright's choice.
- **Verified:**
  - Gate screenshots come from headless Chrome over the DevTools protocol at 1440×900, from a scratchpad script; the browser pane was too narrow for a faithful 1440×900 capture.
  - System follows an emulated OS change live, with no reload. Light and Dark override it either way.

## 2026-10-06 — Phase 5 milestone 6: verification notes

I walked the "done means" list against fresh copies of the notes fixture, driving headless Chrome over the DevTools protocol with real mouse and keyboard events, and checking the files on disk after every step. The walk scripts live in the session scratchpad, not this repo.

- **Checks:** `pnpm test` (541 tests in 38 files), `pnpm typecheck` and `pnpm lint` pass at the root.
- **Undo and redo:** on each canvas, rename, add a row, move, connect and delete each saved. ⌘Z undid all five, and ⇧⌘Z redid them, with the file byte-identical to the expected state after every step (32 checks).
- **Deletes:** deleting User or Notes deleted at once with a toast naming what went ("Deleted 'Note', 3 attributes and 2 relationships", "Deleted 'Notes' and 4 transitions"). The toast's Undo restored `erd.json` byte for byte, layout included.
- **Field undo:** ⌘Z in a field undid the typing ("Notebook" back to "Note"), and the file was untouched.
- **⌘D:** two connected entities, and two connected screens, were copied with the links between them (1 relationship, 3 transitions), and the copies were selected.
- **Nudge:** fifteen held → keydowns (auto-repeat) moved the card 15 units in one save, and one ⌘Z put it back.
- **⌥↑:** moved an attribute, a sees item, a CTA and a state. A state moved to the top became the default, and the field stayed open on the moved row.
- **File watching:**
  - An outside edit to `erd.json` showed within a second, with no refocus.
  - An outside edit to `flows.json` under unsaved edits showed the banner and "Save on hold", and the file wasn't overwritten.
  - Keep mine overwrote the file. Load from disk showed the file's content and dropped the local edit.
- **`spec.md`:**
  - Opening a project didn't create it, and an edit and its undo both kept it up to date.
  - With `erd.json` hand-broken, a Flows save left it alone.
  - Initialising a new folder from the picker writes it beside the three files.
- **Copy Mermaid:** on both canvases it put `erDiagram` / `flowchart LR` source on the clipboard and showed "Mermaid copied".
- **Shortcuts:** 1/2/3, = and −, ⇧0, ⇧1, ?, E and Esc all did what the overlay says. The overlay takes the keyboard while open.
- **Parallel relationships:** two between User and Note, and two self-relationships on User, were each clickable on their own path and opened their own popover.
- **Phases 1–4 spot checks:** picker initialise, the empty ERD card, close back to the picker with recents, the validation surface (gate screenshots) and the UI view's preview.
- **Walk-script artefacts, not app bugs:** two first-run failures came from the script. A Shift-click needs a real Shift keydown, as phase 2 found. An open state-name field keeps the name out of the header's text.
- **Not verifiable here, left as hand checks:**
  - Whether Chrome or Safari wins any shortcut (simulated keys skip the browser's own handling).
  - Trackpad gestures.
  - The System theme following a real OS appearance change (verified with emulated media only).
  - GitHub's own Mermaid rendering of `spec.md`, which needs a push (verified with Mermaid's parser and a local Mermaid 11 render).

## 2026-10-06 — Copy Mermaid replaced by undo and redo buttons (supersedes the brief's §5 "Copy Mermaid")

Decided after the phase 5 walk.

- **Copy Mermaid is gone.** Both diagrams are already in `.design/spec.md`, which is rewritten on every save and rendered by GitHub, so a button to copy them added little.
- **`packages/spec` still exports `erdMermaid` and `flowsMermaid`.** `renderSpec` uses them, and phase 6 may too. `apps/web` no longer depends on the package.
- **Undo and redo buttons** (↶ ↷) now sit in the same toolbar slot, after the view's add button.
  - They run the same steps as ⌘Z and ⇧⌘Z, through `useCanvasHistory`, so what a step touched is selected afterwards.
  - Each is disabled when there's nothing to undo or redo, using the editor's `canUndo` / `canRedo`.
  - Their tooltips give the shortcut from the registry.
  - A disabled icon button is drawn in faint text and gets no hover background.
- **Verified in headless Chrome on both canvases, in light and dark:**
  - Both buttons start disabled, and a delete enables Undo.
  - Undo restores the file byte for byte, selects the restored card and enables Redo.
  - Redo applies the delete again.

## 2026-10-06 — CTAs read like sees items (supersedes phase 3's "lo-fi buttons")

Decided after the phase 5 walk.

- **Captions:** a state's CTA list is captioned "Actions" (it was "Does").
- **No outline:** CTAs are no longer drawn as outlined lo-fi buttons. Each is a one-line row styled exactly like a sees item (muted text, the same indent), marked with a small arrow (a line with a head) where sees items have a dash.
- **The arrow** is an 8 × 8 SVG used as a CSS mask, so its colour still comes from `--color-text-faint` and it themes with everything else. Its size is the new `--cta-arrow-size`, replacing `--cta-row-h`.
- **CTA rows are one line now**, so `flows/metrics.ts` estimates them at the same height as sees items.
- **Dead CSS removed:** phase 1's document-listing styles (`.doc-list`, `.counts`, `.items`, `.ctas`, `.cta`) were left over in `styles.css`. Their `.ctas` margin was pushing the CTA list 8 px right of the sees list.
- **`spec.md` still says "Does:"** under each state, as the brief named it. Changing it is a separate call.
- **Later the same day:** the "Sees" caption became "Information", and both captions are now semibold. The "+ Add item" and "+ Add CTA" rows have 8 px (`--space-2`) above them, and the screen size estimate's per-state footer grew from 56 to 72 to match. The schema field stays `sees`, and `spec.md` still says "Sees:" and "Does:".
- **Then:** `spec.md` lists each state's items under "Information:" and "Actions:", matching the card (the golden files were regenerated). On the card, a thin keyline (`--color-border`, inset to the content) and 8 px of space above and below it separate the "Information" list's "+ Add item" row from the "Actions" list. The footer estimate grew to 90 to match.

## 2026-10-06 — Trial: Google Material Symbols in the theme menu

- The theme menu's ◐ ☀ ☾ glyphs are replaced by Material Symbols (outlined, weight 400): `contrast` for System (first `brightness_auto`, swapped at review), `light_mode` and `dark_mode`.
- They come from the `@material-symbols/svg-400` npm package (Apache-2.0), so they're self-hosted like the font, with no request to Google at runtime. Only the imported SVGs end up in the bundle.
- `Icon.tsx` draws each one as a CSS mask over `currentColor`, so icons take their colour from the surrounding text tokens and theme with everything else. The size is `--icon-size` (18px).
- If the trial is approved, the other glyphs (Reload ↻, close ×, zoom − +, undo/redo ↶ ↷, the shortcuts "?") move to `Icon` too.
- **Approved and extended:** Material Symbols now also draw the Reload icon (`refresh`, in the header, Reload preview and the validation surface, which all share `ReloadGlyph`), the toolbar's undo and redo (`undo`, `redo`), and the header's shortcuts button (`question_mark`). The unused `.glyph` style is gone. Close ×, zoom − + and the arrow in "Open in browser ↗" are still text characters.
- **Also:** the header's close × is Material's `close`. In keyboard hints, ⇧ is drawn with Material's `shift` icon (14px, `--kbd-icon-size`), because the font's ⇧ was too narrow to read. `Kbd` swaps it in for any ⇧ in its text, so the toolbar, buttons and the shortcuts overlay all match. The icon sits inline with the hint's text (`vertical-align`), so rows keep their height. Tooltips still spell shortcuts out in text.
- **And:** "Open in browser" has Material's `open_in_browser` icon in front of its label, replacing the trailing ↗. The icon is in the same leading position as Reload preview's, both in the preview toolbar and on the "refuses to be embedded" card, where it takes the primary button's text colour.
