# modelwright — Phase 2 brief: ERD canvas

Read `CLAUDE.md` and `docs/decisions.md` first. They are the standing context, and the decisions logged during phase 1 (strict schemas, optional layout per node, canonical serialisation, focus re-read, ports 4300/4301) all still hold.

---

## What you are building

The ERD view becomes a real editor. Today it renders a plain list from `.design/erd.json`; by the end of this phase it is an infinite, dot-grid canvas where I can add, edit, move and delete entities and their attributes, connect entities with relationships drawn in crow's-foot notation, and have every change autosaved back to `erd.json`.

This phase also builds the **shared canvas layer** that phase 3's flow chart will reuse, and the **editable-document plumbing** (local edits, autosave, save status) that phase 3 will reuse too. Build both generically. Build nothing flow-specific.

## How to work

1. Start in plan mode. Before writing the plan, interview me on anything in this brief that is ambiguous or that you'd decide differently — in particular the decisions listed under "Decisions this brief makes". Then present the plan and wait for approval.
2. Check `design-refs/` before planning and tell me what's there. If it contains an entity card or canvas export, match it. If it's still empty, build a clean, neutral look consistent with phase 1's `styles.css`, with every canvas colour, radius and spacing value in CSS custom properties in one place so a later restyle is cheap.
3. Work milestone by milestone (listed at the end). Commit at each one and push the branch.
4. Respect the review gate after milestone 3. Stop there with screenshots and wait for me.
5. Vitest is required on the pure logic introduced this phase (see "Tests"). The canvas itself is verified by eye — use the browser tool to load the app, screenshot it, and check your own work before reporting a milestone done.
6. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before declaring any milestone done and report the results.
7. Once the interview has settled the decisions below, log them in `docs/decisions.md`, plus any others you make along the way.

## Scope

### 1. Shared canvas layer — `apps/web/src/canvas/`

A generic `Canvas` component wrapping React Flow (`@xyflow/react`, v12). ERD-specific code passes in its own node types, edge types and handlers. Nothing in `canvas/` knows about entities.

- **Background:** dot grid (`<Background variant={BackgroundVariant.Dots} />`).
- **Trackpad behaviour, Figma-style:** `panOnScroll` on, `zoomOnPinch` on, `zoomOnScroll` off. Two-finger scroll pans, pinch zooms, Cmd + scroll zooms.
- **Pointer behaviour:** dragging on empty canvas draws a selection box (`selectionOnDrag`). Panning with a mouse is middle-button drag or Space + drag. Shift-click adds to the selection.
- **Zoom limits** roughly 0.2–2, plus zoom in / zoom out / fit view controls.
- **Viewport persistence:** the viewport (pan and zoom) is remembered per project in `localStorage`, using the existing `storage.ts` helpers. It is a per-user convenience, not part of the spec, so it never goes into `.design/`. A project opened for the first time fits all nodes in view.
- **Toolbar slot:** the canvas renders a small floating toolbar that the consuming view fills (ERD puts "Add entity" and the save status there).

### 2. Editable documents — `useEditableDoc`

A hook layered on top of phase 1's `useDesign`, generic over `'erd' | 'flows'`, that every editor uses:

- Holds a **local working copy** of the document. Edits apply to the local copy immediately.
- **Autosaves** through `ProjectClient.writeDesign` about 500 ms after the last change. It also flushes immediately when I switch views, close the project, or drop a dragged node.
- **Validates before saving** with the schema package. If an edit somehow produces an invalid document, it does not save. It shows the issues and keeps the local copy, because that is a bug to fix rather than a state to persist.
- **Save status** for the toolbar: `Saved` · `Saving…` · `Unsaved changes` · `Couldn't save — retry`. Clicking the failed state retries.
- **Local edits win while dirty.** Phase 1's re-read on window focus must not overwrite unsaved local changes: while dirty, focus re-reads are skipped. A manual Reload while dirty asks me to confirm discarding the changes, using an in-app dialog rather than `window.confirm`. When clean, re-reads behave as in phase 1. If the re-read document equals the local one (compare canonical `stringify` output), nothing re-renders.
- Warn on browser unload while there are unsaved changes (`beforeunload`).
- An invalid file on disk still shows phase 1's validation surface instead of the canvas. Once the file is fixed and reloaded, the canvas returns.

### 3. ERD operations — `apps/web/src/erd/ops.ts`

All edits to an `Erd` go through pure functions — `(erd, …args) => erd` — with no React and no I/O. At minimum:

- `addEntity(erd, position)` → returns the new document and the new entity's id
- `renameEntity`, `setEntityDescription`
- `deleteEntities(erd, ids)` — cascades: removes the entities, every relationship touching them, and their layout entries
- `addAttribute(erd, entityId, afterAttributeId?)` → returns the new id, `updateAttribute(name/note)`, `deleteAttribute`
- `moveEntities(erd, positions)`
- `addRelationship(erd, from, to)` → defaults to `fromCard: 'one'`, `toCard: 'zero-many'`
- `updateRelationship(cardinalities / label)`, `reverseRelationship` (swaps `from`/`to` and the two cardinalities), `deleteRelationships`

Every operation must return a document that passes the `Erd` schema. Assert this in the tests.

**Ids.** New ids are short random strings with a readable prefix — `ent_`, `attr_`, `rel_` followed by about 8 nanoid characters — so diffs of `erd.json` stay legible to me and to Claude Code. Existing ids in a file are never rewritten.

### 4. Placement of unpositioned entities — `apps/web/src/erd/placement.ts`

Phase 1 made layout optional per node. Entities with no `layout` entry, typically added by hand or by Claude Code, are placed deterministically: in document order, in a row below the bounding box of the positioned entities, with enough spacing that they don't overlap. If there are no positioned entities, start a grid at the origin. This is a pure function and it gets tested.

Computed positions live only in memory until I edit something. **Opening a project never writes to disk on its own.** The first real edit saves them along with everything else.

Positions are the top-left corner of the node in canvas units — React Flow's default, and what the phase 1 fixture already assumes.

### 5. Entity node

- **Header:** the entity name. Double-click to edit inline; Enter or blur commits, Escape cancels. An empty name is not allowed and reverts to the previous name.
- **Description:** optional, shown as a muted line under the name, and editable inline the same way. An "Add description" affordance appears on hover when there isn't one.
- **Attribute rows:** name, with the note shown muted beside or beneath it. Both are inline-editable.
  - Enter in an attribute name commits it and creates a new attribute directly below with focus in it, for fast entry. Enter on an empty new row removes it and ends entry.
  - Each row has a delete control on hover.
  - "+ Add attribute" sits at the bottom of the card.
- **New entity:** created via "Add entity" in the toolbar (placed at the centre of the viewport) or by double-clicking empty canvas (placed at the pointer). It is named "Entity", with its name field focused and selected.
- **Editing hygiene:** inputs inside nodes use React Flow's `nodrag` / `nowheel` classes so typing and selecting text never drags or zooms the canvas. Keyboard shortcuts must never fire while a text field has focus.

### 6. Relationship edges — crow's-foot notation

- **Floating edges.** An edge connects the nearest sides of the two entity cards and re-routes as they move. Follow React Flow's "floating edges" pattern rather than fixed handles.
- **Markers.** The cardinality at each end is drawn as a custom SVG marker oriented along the edge. In this tool's notation:

  | Value | Meaning | Glyph |
  |---|---|---|
  | `one` | exactly one | two bars `‖` |
  | `zero-one` | zero or one | circle + bar `o|` |
  | `many` | one or more | bar + crow's foot `|<` |
  | `zero-many` | zero or more | circle + crow's foot `o<` |

  **`fromCard` is drawn at the `from` entity's end and `toCard` at the `to` entity's end.** Each describes how many of that end's entity relate to one of the other. In the fixture, User→Note is `one` / `zero-many`: the User end shows `‖` (a note belongs to exactly one user) and the Note end shows `o<` (a user owns zero or more notes). Put the marker geometry in one module, with a pure mapping from cardinality to marker that gets tested.
- **Label** at the midpoint, if present.
- **Creating:** on hover, connection handles appear on the entity's sides. Dragging from one and dropping anywhere on another entity creates a relationship with the default cardinalities. Dropping on the same entity does nothing — self-relationships aren't created from the UI in this phase.
- **Editing:** selecting an edge shows a small popover at its midpoint (React Flow's `EdgeLabelRenderer`). It holds two cardinality pickers, one per end and labelled with the entity names, with options in plain words plus their glyph; a label field; "Reverse direction"; and "Delete".
- **Robustness:** if a file already contains a self-relationship or several relationships between the same pair, they must render without crashing and stay selectable. Making them look good is phase 5.

### 7. Selection and deletion

- Click selects; Shift-click and the selection box multi-select; Escape clears the selection.
- Delete or Backspace deletes everything selected, never while a text field has focus.
- **Confirm before destructive cascades.** If the deletion includes an entity that has attributes or relationships, show an in-app confirmation stating what will go ("Delete 'User', its 2 attributes and 1 relationship?"). Undo arrives in phase 5, so this confirmation is the only safety net until then. Deleting empty entities and bare relationships doesn't ask.

### 8. Moving

Dragging updates positions live on the canvas, but the document changes only on drag stop: one `moveEntities` call covering every dragged node, followed by an immediate save. Nothing writes per frame.

## Decisions this brief makes

Challenge any of these in the interview. Once settled, log them in `docs/decisions.md`.

- **Crow's-foot semantics.** `fromCard` is drawn at the `from` end, `toCard` at the `to` end. `many` means one or more; `zero-many` means zero or more.
- **New relationships default to `one` → `zero-many`**, the common one-to-many case.
- **Autosave, not explicit save.** Saves happen about 500 ms after the last edit, and immediately on drag stop, view switch or close.
- **Local edits win while dirty.** Focus re-reads are skipped while there are unsaved changes, and a manual Reload asks first.
- **Opening a project never writes.** Computed positions for unpositioned entities stay in memory until the first real edit.
- **The viewport lives in `localStorage`, not `.design/`.** It is a per-user convenience, not part of the spec.
- **Prefixed ids** (`ent_`, `attr_`, `rel_`) for legible diffs. Existing ids are never rewritten.
- **Confirmation stands in for undo** when a delete cascades, until phase 5.
- **No self-relationships from the UI** this phase. Ones already in a file still render.

## Tests (Vitest)

Add `apps/web` to the root `vitest.config.ts` projects, using the node environment for pure modules. Required coverage:

- **`ops.ts`:** every operation, including the cascades. Deleting an entity removes its relationships and layout entry. Reversing swaps both ends and both cardinalities. Every result passes `Erd`. Inputs are never mutated.
- **`placement.ts`:** deterministic output, no overlap with positioned nodes, document order respected, empty-document case.
- **Cardinality → marker mapping.**
- **Id generation:** prefix and uniqueness against existing ids.
- **Round trip:** apply an op, stringify, parse, and get an equal document. A single rename changes exactly one line of `stringifyErd` output.

Hooks and components are verified by eye in the browser; no React component tests are required.

## Out of scope for phase 2

Do not build any of these, even if they seem small:

- Anything in the Flows or UI views. They stay as phase 1 left them.
- Undo/redo, keyboard shortcuts beyond select, delete and Escape, dark mode, Mermaid export (phase 5)
- Reordering attributes
- Physical ERD fields (types, keys, nullability) or any schema change. If you think the schema needs a change, stop and ask me.
- Auto-layout (dagre or elk), minimap, copy/paste, duplicate
- Visual separation of parallel or self relationships (they only need to render and stay selectable)
- File watching (focus re-read plus manual Reload remain the mechanism)
- Server changes. None should be needed; if one is, tell me why before making it.

## Milestones (one commit each, pushed)

1. **Canvas foundation.** `@xyflow/react` added; the generic `Canvas` with dot grid, trackpad behaviour, zoom controls, viewport persistence and the toolbar slot. The ERD view renders entities from the document as simple read-only boxes at their layout positions, with unpositioned ones placed, and relationships as plain lines. `placement.ts` and its tests.
2. **Operations.** `ops.ts`, id generation and the full test suite above, all passing. No UI wiring yet.
3. **Entity node and crow's-foot edges — review gate.** The real entity card and floating crow's-foot edges with labels, still read-only. **Stop here.** Show me screenshots of the phase 1 notes fixture, and of a busier example of your own (five or six entities with every cardinality used at least once), at 100% and at about 50% zoom. Wait for my go-ahead. This is where the visual design gets judged, so expect changes.
4. **Editing entities.** `useEditableDoc` with autosave and save status; add, rename, describe and delete entities; inline attribute editing with Enter-to-continue; drag to move; delete with confirmation.
5. **Editing relationships.** Connect by dragging, the edge popover (cardinalities, label, reverse, delete), and multi-select delete across entities and edges.
6. **Verified.** Walk the "done means" checklist below by hand, fix what it finds, and report the results.

## Done means

All of the following, demonstrated rather than asserted:

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass at the repo root.
- [ ] Opening the notes fixture shows User and Note at their layout positions on a dot grid. The relationship shows `‖` at User, `o<` at Note, and the label "owns".
- [ ] On a trackpad, two-finger scroll pans, pinch zooms, and dragging on empty canvas draws a selection box.
- [ ] Double-clicking empty canvas creates an entity at the pointer with its name ready to type. "Add entity" creates one in the centre of the view.
- [ ] I can rename an entity, add a description, and add three attributes in a row using only the keyboard (type, Enter, type, Enter…), then add a note to one and delete another.
- [ ] Dragging an entity and refreshing the browser keeps it where I dropped it. `git diff` on `erd.json` shows only that entity's `layout` entry changing.
- [ ] Renaming one attribute changes exactly one line in `erd.json`.
- [ ] Dragging from one entity to another creates a relationship. I can set each end to each of the four cardinalities and the markers update correctly; I can label it, reverse it and delete it.
- [ ] Deleting an entity that has attributes and a relationship asks for confirmation. Afterwards the entity, its relationships and its layout entry are all gone from `erd.json`, and the file validates.
- [ ] The save status moves through `Unsaved changes` → `Saving…` → `Saved` as I edit. With the server stopped, it shows `Couldn't save — retry` and keeps my edits; with the server restarted, retry saves them.
- [ ] With no unsaved changes, editing `erd.json` in a text editor and refocusing the window shows the change on the canvas. With unsaved changes, refocusing does not clobber them, and manual Reload asks first.
- [ ] Adding an entity to `erd.json` by hand without a `layout` entry places it below the others without overlap, and opening the project doesn't modify the file.
- [ ] Breaking `erd.json` by hand shows phase 1's validation surface instead of the canvas, with no crash. Fixing it and pressing Reload brings the canvas back.
- [ ] Typing in any field inside a node never pans, zooms, drags or deletes anything.
- [ ] The Flows and UI views behave exactly as they did at the end of phase 1.

When every box is ticked and committed, phase 2 is complete. Phase 3 (flow canvas) starts in a new session and reuses `Canvas` and `useEditableDoc`.
