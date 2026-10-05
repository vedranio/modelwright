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
