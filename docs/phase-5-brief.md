# modelwright — Phase 5 brief: Polish

Read `CLAUDE.md` and `docs/decisions.md` first. They are the standing context. Everything decided in phases 1–4 still holds, in particular:

- the platform boundary, and the origin/host guard
- "opening a project never writes"
- the hint rule: a keyboard hint shows only for a shortcut that works
- the ⌘R lesson: a browser shortcut can win over `preventDefault`, so check by hand in Chrome and Safari before shipping any shortcut the browser also uses
- every visual value comes from `tokens.css`
- the pure-operations conventions (same-object returns, blank optionals removed, results always valid)

---

## What you are building

Phases 1–4 built every view. This phase makes modelwright safe and fast to work in, and makes its output readable outside the tool. Five things:

1. **Undo and redo** on both canvases. This is overdue: phase 3 dropped Flows' delete confirmations because undo was coming, and the ERD's confirmations were always a stopgap for it.
2. **Keyboard shortcuts**, plus a shortcuts overlay, so the canvases can be driven without hunting for hover controls.
3. **File watching.** Phase 6 has Claude Code editing `.design/` while modelwright is open, so the tool must notice external changes and never silently overwrite them. Today the rule is "last writer wins".
4. **A generated spec:** `.design/spec.md`, written beside the design files, with Mermaid diagrams and plain-language tables. GitHub renders it, people can read it, and phase 6's build skill has a narrative to work from.
5. **Dark mode.**

Plus one visual debt from phase 2: proper separation of parallel relationships on the ERD.

## How to work

1. Start in plan mode. Before writing the plan, interview me on anything in this brief that is ambiguous or that you'd decide differently — in particular the decisions listed under "Decisions this brief makes" and the proposed shortcut list. Then present the plan and wait for approval.
2. Check `design-refs/` before planning and tell me what you find. If a `phase 5 designs/` folder exists (most likely dark-mode artboards, the shortcuts overlay, or toasts), match it. If not, derive everything from the existing tokens and components; it'll be judged at the review gates.
3. Work milestone by milestone (listed at the end). Commit at each one and push the branch.
4. Respect the two review gates: after milestone 4 (the generated spec) and after milestone 5 (dark mode). Stop there and wait for me.
5. Vitest is required on all pure logic and on server changes (see "Tests"). UI is verified by eye in the browser.
6. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before declaring any milestone done and report the results.
7. Once the interview has settled the decisions below, log them in `docs/decisions.md`, plus any others you make along the way.

## Scope

### 1. Undo and redo

- **Per document.** ERD and Flows each have their own history. ⌘Z and ⇧⌘Z (and ⌘Y off macOS: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) act on the document of the view you're in. Config edits (project name, preview URL) are not undoable; they're single-field commits with an obvious way back.
- **A step is one committed edit:** one `apply` call. A field commit, a drag stop (all dragged nodes together), a multi-select delete, a new transition and so on are each one step. Typing inside a field isn't a step. While a text field has focus, ⌘Z is the field's own native undo.
- **Undo and redo go through the normal path.** They set the working copy and autosave like any other edit, and the save status reflects them. A new edit after an undo clears the redo stack.
- **History is cleared** when the working copy is replaced from disk (Reload, an external change you accept, reopening the project), and capped at around 200 steps.
- **Selection after undo/redo:** select the nodes or edges the step touched, where they still exist, so I can see what changed. If that turns out to be awkward, propose something simpler in the interview.
- **Where it lives:** history belongs in the pure state logic beside `editing/editableState.ts`, not in components, so it's testable without React.

### 2. Deletes: undo toast instead of confirmation

- Remove the ERD's cascade confirmation dialog (`erd/deletion.ts` and its use). Flows already has none.
- Every delete on either canvas shows a short-lived toast naming what went, with an Undo button. For example: "Deleted 'User', 2 attributes and 1 relationship · Undo". The toast's Undo is the same as ⌘Z. It dismisses itself after about 6 seconds, or on the next edit.
- **The toast is a shared component,** built from tokens and placed so it doesn't cover the canvas toolbar or the save status. Reuse it for anything else in this phase that needs a transient message (e.g. "Mermaid copied").
- The cascade-description wording from `erd/deletion.ts` is reused for the toast text where it fits. Write the Flows equivalent alongside it.

### 3. Keyboard shortcuts

Proposed set — challenge any of it in the interview. None of these fire while a text field has focus, except where noted as field-owned.

| Shortcut | Action | Where |
|---|---|---|
| ⌘Z / ⇧⌘Z | Undo / redo | ERD, Flows |
| ⌘A | Select all nodes and edges | ERD, Flows |
| ⌘D | Duplicate selected nodes (see below) | ERD, Flows |
| Arrow keys | Nudge selected nodes 1 unit; with ⇧, 10 units | ERD, Flows |
| + / − | Zoom in / out | ERD, Flows |
| ⇧0 | Zoom to 100% | ERD, Flows |
| ⇧1 | Fit (exists) | ERD, Flows |
| E / S | Add entity / screen (exist) | ERD / Flows |
| 1 / 2 / 3 | Switch to ERD / Flows / UI | Anywhere outside a field |
| ⌥↑ / ⌥↓ | Move the row being edited up or down (field-owned) | Attribute, sees item, CTA and state name fields |
| ? | Show the shortcuts overlay | Anywhere outside a field |

- **Duplicate** copies the selected entities or screens with fresh ids, offset by one grid step, and selects the copies. Relationships or transitions *between* duplicated nodes are duplicated too; ones to nodes outside the selection are not. A duplicated screen's CTAs keep their labels but start with no outgoing transitions. Duplicate is a pure operation per document (`duplicateEntities`, `duplicateScreens`).
- **Nudge** writes positions through `moveEntities` / `moveScreens`. A burst of key repeats should land as one undo step and one save, not dozens. Coalesce until the key is released or after a short pause.
- **Reordering** is new pure operations: `moveAttribute`, `moveSeesItem`, `moveCta` and `moveState`. Moving a state to the first position makes it the default, consistent with `makeDefaultState`. The field stays focused on the moved row. This closes the "no reordering" gap left by phases 2 and 3.
- **Browser conflicts:** ⌘D (bookmark) and possibly + and − can be claimed by the browser. Check each one by hand in Chrome and Safari, as the ⌘R decision requires. Anything the browser wins is dropped from the web build, and its hints with it, and logged for Electron.
- **Shortcuts overlay** (`?`, and a small "?" button in the header): a modal listing every working shortcut, grouped by where it applies, with the same `Kbd` styling as the hints. It's generated from one shortcut registry, so the overlay, the hints and the handlers can't drift apart.

### 4. File watching and external changes

- **`ProjectClient.watchDesign(path, onChange) → unsubscribe`.** It reports `{ kind: 'erd' | 'flows' | 'config' }` whenever a design file changes on disk. `httpClient` implements it with Server-Sent Events from a new `GET /api/design/events?path=` endpoint behind the existing guard. Electron's IPC client will implement it in the main process later.
- **Server side:**
  - Watch `<project>/.design/` for the three design files only, with debouncing for editors that write in several steps.
  - Ignore changes the server itself just wrote: compare against the content of its own last write to that file, not just timing.
  - One watcher per open project, released when the last subscriber disconnects.
- **Web side:**
  - **Clean** (no unsaved changes for that file): re-read it and show the new content, exactly as a focus re-read does today, then clear that document's undo history.
  - **Dirty:** don't autosave over it. Pause that document's autosave and show a banner on its view: "erd.json was changed outside modelwright." It offers **Load from disk** (discards local edits and history) and **Keep mine** (overwrites the file with the local copy, and autosave resumes). Until I choose, edits keep applying locally and the save status says the save is on hold.
  - The focus re-read stays as a fallback.
- **This replaces the phase 2 decision "external edits while dirty: last writer wins".** Log the supersession.

### 5. Generated spec — `.design/spec.md`

- **A pure generator** in a new workspace package, `packages/spec` (depending on `@modelwright/schema`): `renderSpec(config, erd, flows) → string`. It's deterministic, so the same input gives byte-identical output and git shows no diff for unchanged designs. A package rather than inside `apps/server` because phase 6's build skill may run it too.
- **Contents**, in this order:
  1. A header line: "Generated by modelwright from erd.json, flows.json and config.json — don't edit; it's overwritten on every save." Then the project name.
  2. **Data model:**
     - a Mermaid `erDiagram`
     - a table per entity: attribute name and note
     - every relationship in plain words, using the crow's-foot semantics from phase 2 — for example, "Each User owns zero or more Notes. Each Note belongs to exactly one User." Use the label where there is one, and a neutral verb where there isn't.
  3. **Screens and flows:**
     - a Mermaid `flowchart LR`, with multi-state screens as subgraphs of their states
     - then, per screen: its states, each with "Sees" and "Does" lists, and for each CTA where it leads (screen › state, with the transition label)
     - CTAs with no transition are marked "(dead end)"
  4. **Preview:** the preview URL and devices, if set.
- **Mermaid mapping:**
  - Cardinalities map directly: `one` → `||`, `zero-one` → `|o` / `o|`, `many` → `}|` / `|{`, `zero-many` → `}o` / `o{`, oriented so each symbol sits at its own entity's end.
  - Entity and screen names can contain spaces and punctuation, so generate safe identifiers from ids and show names as labels or aliases.
  - Mermaid's `erDiagram` wants a type per attribute, but the ERD is conceptual. Either omit attribute blocks from the diagram (attributes are in the tables) or use a neutral placeholder type. Pick one and log it.
  - The output must render on GitHub.
- **When it's written:**
  - The **server** regenerates `spec.md` after every successful `PUT` of any design file, and after `init`, but only if all three files parse; if any doesn't, the existing `spec.md` is left as it is.
  - Opening a project still never writes.
  - It's written atomically, like the design files.
  - This widens the server's write rule from "the three design files" to "the three design files and `.design/spec.md`", and nothing else.
  - The watcher ignores `spec.md`.
- **In the UI:** a "Copy Mermaid" action on each canvas (in the toolbar, or an overflow next to it) copies that view's diagram source, with a toast. No other export UI.

### 6. Dark mode

- **Theme setting:** System (default), Light or Dark, remembered in `localStorage`. It's switched from a small control in the header, and from the shortcuts overlay's footer if that's tidier.
- **Tokens:** every colour token in `tokens.css` gets a dark counterpart, applied via `[data-theme="dark"]` and via `prefers-color-scheme` when set to System. No component gets its own dark-mode overrides; if something can't be expressed through tokens, add a token.
- **Everything themes:** the picker, header, toggle, cards, edges, crow's-foot markers, arrowheads, handles, the dot grid, popovers, toasts, the validation surface, the save status, the preview toolbar and the device frame.
- **Not themed:** the previewed app inside the iframe (it's someone else's page). The design-refs are light-only and stay the light-mode reference.
- **Contrast:** body text and interactive controls meet WCAG AA in both themes. Check the faint-text, border and dot-grid tokens especially.

### 7. Parallel relationships on the ERD

Phase 2 offset parallel relationships 16 units apart as a minimum and deferred proper separation to now. Two or more relationships between the same pair of entities should:

- read as distinct, evenly spread lines
- keep their crow's-foot markers clear of each other
- keep each label next to its own line
- stay individually selectable

Self-relationships should be drawn so that several on one entity don't overlap. Geometry stays pure and tested. Routing around unrelated cards is still out of scope.

## Decisions this brief makes

Challenge any of these in the interview. Once settled, log them in `docs/decisions.md`.

- **Undo is per document,** covers ERD and Flows only, treats one committed edit as one step, and is cleared when disk content replaces the working copy.
- **Undo toasts replace delete confirmations** on both canvases. The ERD confirmation dialog goes.
- **One shortcut registry** drives the handlers, the hints and the overlay.
- **The shortcut set** as proposed in section 3, with anything the browser wins dropped and logged for Electron.
- **Reordering by ⌥↑/⌥↓ while editing a row.** No drag-to-reorder this phase.
- **Duplicate copies internal links only.** A duplicated screen's CTAs start with no transitions.
- **File watching replaces "last writer wins".** A dirty document with an external change pauses autosave and asks.
- **`.design/spec.md` is generated by the server on every successful save,** never on open. The generator is a pure package, and the file is the only new thing the server may write.
- **Dark mode is token-only,** with System/Light/Dark and System as the default.

## Tests (Vitest)

- **Undo history:** push, undo, redo, the redo stack cleared by a new edit, the cap, cleared on replacement from disk, and nudge coalescing. These are tested in the pure state logic.
- **New operations:** `duplicateEntities`, `duplicateScreens` (fresh ids, internal links copied, external links not, positions offset), `moveAttribute`, `moveSeesItem`, `moveCta`, `moveState` (including moving to first making it the default), plus the conventions: same-object no-ops and results that pass the schema.
- **Toast wording** for both documents' cascades.
- **Shortcut registry:** no two shortcuts claim the same key in the same scope, and every registered shortcut has an overlay entry.
- **Watcher (server):** an external write triggers one event after debounce; the server's own write triggers none; `spec.md` triggers none; unsubscribing releases the watcher. Covered against a temp directory, and the SSE endpoint is behind the guard.
- **`packages/spec`:**
  - golden-file tests for the notes fixture and a busier example
  - byte-identical output on repeated runs
  - every cardinality's Mermaid mapping and plain-words sentence
  - names with spaces and punctuation producing valid identifiers
  - dead-end CTAs marked
  - empty documents rendering sensibly
  - if feasible, the Mermaid output parsed with Mermaid's own parser in the test
- **Server spec writing:** regenerated after a valid `PUT`, left untouched when any file is invalid, never written on open, and writes still refused anywhere else.
- **Parallel geometry:** separation for 2, 3 and 4 parallel relationships, and stacked self-relationships.

## Out of scope for phase 5

- Copy/paste (within or across documents), drag-to-reorder, auto-layout, minimap, alignment tools
- Routing edges around unrelated cards
- Undo for config edits, or a single global undo stack across documents
- Any export other than `spec.md` and Copy Mermaid (no PNG/SVG/PDF)
- Editing `devices` or a screen's `entities` from the UI
- Schema changes. If you think one is needed, stop and ask me.
- The `/build-from-design` skill and anything else in phase 6
- Electron

## Milestones (one commit each, pushed)

0. **Undo and redo.** History in the pure state logic, ⌘Z / ⇧⌘Z on both canvases, the shared toast, and undo toasts replacing the ERD confirmation.
1. **Shortcuts.** The registry, the overlay, select all, duplicate, nudge, zoom keys, view switching, and row reordering, with the browser-conflict checks done and logged.
2. **Parallel relationships.** ERD geometry for parallel and stacked self-relationships.
3. **File watching.** `watchDesign`, the SSE endpoint, the server watcher, and the clean and dirty handling with the conflict banner.
4. **Generated spec — review gate.** `packages/spec`, server regeneration, and Copy Mermaid. **Stop here.** Show me the generated `spec.md` for the notes fixture and for a busier example, both as raw Markdown and rendered with the Mermaid diagrams — on a throwaway GitHub gist, or a local Markdown preview that renders Mermaid. Wait for my go-ahead. I'll judge the wording and structure; this file is what Claude Code will read in phase 6.
5. **Dark mode — review gate.** Tokens, the theme setting, and every surface checked. **Stop here.** Show me screenshots of every view and state in both themes at 1440×900: picker, ERD with the notes fixture, Flows with the notes fixture, an open popover, a toast, the validation surface, the shortcuts overlay, and the UI view with a preview. Wait for my go-ahead.
6. **Verified.** Walk the "done means" checklist below by hand, fix what it finds, and report the results.

## Done means

All of the following, demonstrated rather than asserted:

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass at the repo root.
- [ ] On both canvases, I can make five different kinds of edit (rename, add a row, move, connect, delete), undo all five with ⌘Z, and redo them with ⇧⌘Z. Each step saves, and the file matches after each.
- [ ] Deleting an entity with relationships deletes immediately and shows a toast naming what went. Its Undo restores everything, including the relationships and the layout entry. The same works for a Flows screen with transitions.
- [ ] ⌘Z inside a text field undoes typing in that field, not a document edit.
- [ ] Every shortcut in the overlay works, and every shortcut that works is in the overlay. No hint is shown for a shortcut the browser intercepts.
- [ ] ⌘D duplicates two connected entities (or screens) with their link between them, and selects the copies.
- [ ] Holding an arrow key nudges smoothly, and lands as one undo step.
- [ ] ⌥↑/⌥↓ reorders attributes, sees items, CTAs and states while editing them. Moving a state to the top makes it the default.
- [ ] With no unsaved changes, editing `erd.json` in a text editor updates the canvas within about a second, with no window refocus needed.
- [ ] With unsaved changes, editing `flows.json` externally shows the conflict banner and doesn't overwrite the file. "Load from disk" and "Keep mine" each do what they say.
- [ ] After any edit, `.design/spec.md` exists and is up to date. Opening a project doesn't create or change it. With `erd.json` hand-broken, it's left alone.
- [ ] `spec.md` for the notes fixture renders on GitHub with both diagrams, and its relationship sentences read correctly in both directions.
- [ ] Copy Mermaid on each canvas copies valid diagram source and shows a toast.
- [ ] Dark mode via System follows the OS setting live; Light and Dark override it, and the choice persists. Nothing in the UI stays light-only.
- [ ] Two relationships between the same entities, and two self-relationships on one entity, are clearly separate and individually selectable.
- [ ] Everything from phases 1–4 still works. Spot-check the done-means of each.

## Hand checks for me

Things simulated input can't prove, which earlier phases flagged. List them in your final report so I can check them on my machine:

- trackpad two-finger pan, pinch zoom, and Shift-click on both canvases
- every shortcut from section 3 in real Chrome and Safari
- the System theme following a live OS appearance change

When every box is ticked and committed, phase 5 is complete. Phase 6 (pipeline: the `/build-from-design` skill and a first real project) starts in a new session.
