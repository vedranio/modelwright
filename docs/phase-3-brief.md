# modelwright — Phase 3 brief: Flow canvas

Read `CLAUDE.md` and `docs/decisions.md` first. They are the standing context. Everything decided in phases 1 and 2 still holds, in particular: autosave and "local edits win while dirty", "opening a project never writes", the hint rule (a keyboard hint shows only for a shortcut that works), confirmation instead of undo, double-click to edit text, Tab/Enter field navigation, measured sizes merged back into nodes, deletion through `onBeforeDelete`, and every visual value coming from `tokens.css`.

---

## What you are building

The Flows view becomes a real editor, the twin of the ERD canvas. Today it renders a plain list from `.design/flows.json`. By the end of this phase it is the same dot-grid canvas, holding one lo-fi card per screen of the app being designed. Each card shows:

- **the screen's name**
- **what the user sees** — a short list of plain-language items
- **what the user can do** — its CTAs

A screen can have several **states** (default, empty, error…), stacked inside the same card; the first is the default. I connect screens by dragging from a CTA to the screen, or the specific state, it leads to. Those arrows are the app's flow, and every change autosaves to `flows.json`.

This phase reuses phase 2's `Canvas`, `useEditableDoc`, selection, measurement and shortcut plumbing. It should add as little new infrastructure as possible. Where phase 2 built something inside `erd/` that flows needs too, promote it to a shared place first (milestone 0) rather than copying it.

## How to work

1. Start in plan mode. Before writing the plan, interview me on anything in this brief that is ambiguous or that you'd decide differently — in particular the decisions listed under "Decisions this brief makes". Then present the plan and wait for approval.
2. Check `design-refs/` before planning and tell me what you find. If a `phase 3 designs/` folder exists, it's the visual source of truth for the screen card and transition edges, so read its README and PNGs and match them. If it doesn't, build the card from the existing tokens and the visual language of the entity card, so the two canvases read as one system. Either way, it gets judged at the milestone 3 review gate. The empty state follows `design-refs/phase 1 designs/05-shell-empty-states.png`, now including its "Add screen S" button.
3. Work milestone by milestone (listed at the end). Commit at each one and push the branch.
4. Respect the review gate after milestone 3. Stop there with screenshots and wait for me.
5. Vitest is required on the pure logic introduced or moved this phase (see "Tests"). The canvas is verified by eye in the browser.
6. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before declaring any milestone done and report the results.
7. Once the interview has settled the decisions below, log them in `docs/decisions.md`, plus any others you make along the way.

## Scope

### 0. Promote shared pieces out of `erd/`

Phase 2 built several things inside `apps/web/src/erd/` that aren't about entities. Move or generalise them before any flow work, **with no behaviour change to the ERD**:

- **`InlineField`** → a shared location (e.g. `apps/web/src/editing/`).
- **Id generation** (`ids.ts`) → shared, generalised over prefixes, keeping the phase 2 rules: a lowercase `a-z0-9` alphabet, 8 characters, and a retry on collision with every id already in the file. The ERD keeps `ent_`, `attr_` and `rel_`. Flows adds `scr_`, `st_`, `cta_` and `tr_`.
- **Placement** (`placement.ts`) → a generic function over "nodes with an optional layout entry and an estimated size". ERD and flows each pass their own size estimator.
- **Edge geometry** that isn't crow's-foot-specific (orthogonal routing with rounded corners, `sideAngle`, parallel offsets) → shared canvas geometry.
- **The editor-context pattern** (`EditTarget`, `isEditing`, `setEditing`) → keep the ERD's types where they are, but extract whatever is generic so flows doesn't duplicate it.
- **The cascade-confirmation helper** (`deletion.ts`) → shared if its wording logic generalises cleanly; otherwise leave it and write a flows equivalent.

All existing ERD tests must pass unchanged, apart from import paths. Re-check the ERD by hand in the browser after the move.

### 1. Flows on the canvas

- `FlowsView` renders the shared `Canvas` with its own node and edge types, using the viewport key `viewport:flows:<projectPath>`, which phase 2 already prepared for.
- `Shell` hosts a second `useEditableDoc` for `'flows'`. The two documents are independent: each has its own dirty flag, save status and flush. Switching views flushes the one being left. Close and Reload consider both.
- **Toolbar:** "Add screen" with its **S** shortcut, then the existing zoom controls and Fit (⇧1). The save status pill sits bottom left, as on the ERD.
- **Empty state:** 05's "No screens yet" card with its "Add screen S" button, floating over the canvas, toolbar included, following the phase 2 decision for the ERD's empty state.
- **Unpositioned screens** are placed with the shared placement function and a `estimateScreenSize` estimator. As on the ERD, they're held in memory until the first real edit, and opening never writes.

### 2. Flow operations — `apps/web/src/flows/ops.ts`

All edits to a `Flows` document go through pure functions — `(flows, …args) => flows` — following the phase 2 conventions:

- a missing target is a no-op that returns the same object
- an unchanged edit returns the same object
- blank optional strings remove their key
- positions are rounded to whole units
- new ids are unique across the file
- inputs are never mutated

At minimum:

- **Screens:** `addScreen(flows, position)` → creates the screen with one state named "Default" (empty `sees`, empty `ctas`) and returns its id; `renameScreen`; `setScreenNotes`; `deleteScreens(flows, ids)`, which cascades to every transition from or to those screens and to their layout entries; `moveScreens`.
- **States:** `addState(flows, screenId, afterStateId?)` → returns the new id; `renameState`; `deleteState`, which refuses to remove a screen's last state (no-op); `makeDefaultState`, which moves a state to first position.
- **Sees items:** `addSeesItem(flows, screenId, stateId, afterIndex?)`, `updateSeesItem`, `deleteSeesItem`. Sees items are plain strings addressed by index.
- **CTAs:** `addCta(flows, screenId, stateId, afterCtaId?)` → returns the new id; `renameCta`; `deleteCta`, which cascades to transitions starting from it.
- **Transitions:** `addTransition(flows, from, to)` → returns the new id; `updateTransition` (label, target state); `deleteTransitions`.

**Cascade rules:**

| Deleted | Transitions starting there | Transitions ending there |
|---|---|---|
| Screen | deleted | deleted |
| State | deleted (they start from its CTAs) | retargeted to the screen's default state, by removing `stateId` |
| CTA | deleted | — |

Retargeting is less destructive than deleting, and the confirmation (section 6) says it's happening.

**Data the UI never edits is preserved.** A screen's `entities` cross-reference survives every operation untouched.

Every operation must return a document that passes the `Flows` schema; assert this in the tests.

### 3. Screen card

One React Flow node per screen. All states are expanded; collapsing is out of scope.

- **Header:** the screen name, plus the optional notes as a muted line, behaving like the entity card's name and description. Double-click to edit; "+ notes" appears on hover when there are none.
- **Single-state screens read as a simple card:** name, then "Sees", then "Does". The state's own header is hidden while it's the only state, so the common case carries no state chrome. An "+ add state" affordance appears on hover.
- **Multi-state screens** stack their states in order. Each state has:
  - a header with its name; the first state also carries a "default" tag
  - a **Sees** list
  - a **Does** list of CTA rows

  Hover controls on a state header: rename (double-click), "make default" (for non-first states), and × to delete. There's no × while only one state remains.
- **Sees items and CTA labels are edited like attributes:**
  - double-click to edit
  - Enter commits and creates a new item below, with focus in it
  - Enter on an empty draft ends entry
  - drafts aren't written until they have text
  - each row has a × on hover
  - "+ add" sits at the end of each list
- **Tab moves through a card:** name → notes → first state's sees → its CTAs → the next state, consistent with phase 2's Tab behaviour.
- **Handles:**
  - **source** — every CTA row has one on its right edge
  - **target** — every visible state header has one on its left edge, and so does the screen header (targeting the screen means its default state)

  A CTA's handle is **filled** when at least one transition starts from it and **hollow** when none does. That's the cheapest possible "dead end" signal; anything richer is out of scope.
- **Density:** a screen with three states, each with three sees items and four CTAs, must stay readable at 100% and recognisable at 50%. Size the card from tokens (add `--screen-w` and anything else you need), and make `estimateScreenSize` generous, as phase 2's entity estimate is.

### 4. Transition edges

- **Directed arrows.** An arrow runs from the CTA row's right edge to the target's left edge: the state header when `to.stateId` is set and its state is visible, otherwise the screen header. A single-state screen's hidden state header resolves to the screen header.
- **Routing** follows the ERD's visual language: orthogonal steps with rounded corners, a straight stub at each end, and an arrowhead at the target. Reuse the shared geometry from milestone 0. Fixed ends mean you don't need phase 2's floating-side logic, but edges must route around their own card rather than through it.
- **Transitions within one screen,** from a CTA in one state to another state of the same screen, are the common case (e.g. "Sign in" → the login screen's error state). They loop out of the card's right side and back into the target header on the left. They must be legible and must not cross the card's contents.
- **Several transitions from the same CTA** are allowed, for conditional outcomes such as "Sign in" → Notes on success and → Error on failure. They fan out from the same handle and stay individually selectable. The label is how they're told apart.
- **Labels** sit beside the line, never on it, using the same rule as ERD labels.
- **Creating:** drag from a CTA's handle and drop:
  - on a **state header** → a transition to that state (`to.stateId` set)
  - anywhere else on a **screen card**, including its header → a transition to that screen with `stateId` omitted

  Following phase 2's pattern, `onConnectEnd` finds what's under the pointer, `isValidConnection` stays false, and the new transition is selected. Dropping on empty canvas, or on the CTA's own state, does nothing.
- **Popover** (when exactly one transition, and nothing else, is selected), under the edge midpoint, in the style of phase 2's relationship popover:
  - a read-only "From: Login › Default › Sign in"
  - a **To** select listing the target screen's states, where the first option, "Login (default state)", omits `stateId`
  - the label field (saved on Enter or blur; Escape restores it)
  - Delete

  Changing the target screen means deleting the transition and drawing a new one; there's no retargeting across screens in the popover.

### 5. Adding and moving screens

- "Add screen", or **S**, creates a screen at the centre of the view. Double-clicking empty canvas creates one at the pointer. Either way, the new screen is named "Screen" with one "Default" state, and its name field is focused and selected.
- Dragging moves screens. Positions are written on drag stop only, followed by an immediate save, exactly as on the ERD.

### 6. Selection and deletion

The same model as the ERD: click, Shift-click and the selection box select; Escape clears; Delete and Backspace delete the selection, never while a text field has focus. Everything goes through `onBeforeDelete`.

**Confirm when a delete cascades**, naming what goes. Examples:

- "Delete 'Login', its 2 states and 3 transitions?"
- "Delete the 'Error' state? 1 transition from it will be deleted and 2 into it will point to the screen's default state."
- "Delete 'Sign in'? Its 2 transitions will be deleted."

Deleting a screen, state or CTA with no transitions, or deleting bare transitions, doesn't ask.

## Decisions this brief makes

Challenge any of these in the interview. Once settled, log them in `docs/decisions.md`.

- **Promote before you build.** Shared pieces move out of `erd/` first, with no ERD behaviour change, rather than being copied into `flows/`.
- **All states expanded,** per the founding decision. Collapsing is deferred until real use shows it's needed.
- **A single-state screen hides its state header,** so the common case is just name / sees / does.
- **Targeting:** dropping on a state header sets `to.stateId`; dropping anywhere else on a card omits it, meaning the default state. Explicitly targeting the first state is still possible from the popover.
- **Transitions within a screen are first-class,** routed as a loop around the card.
- **Several transitions from one CTA are allowed,** for conditional outcomes, and are told apart by label.
- **Deleting a state retargets transitions into it to the screen's default state** instead of deleting them. Transitions from its CTAs are deleted.
- **A screen always keeps at least one state.** The UI never offers to delete the last one.
- **Prefixed ids** `scr_`, `st_`, `cta_`, `tr_`, generated by the shared id module.
- **The `entities` cross-reference is preserved but not editable** this phase.
- **Hollow vs filled CTA handles** are the only dead-end signal.

## Tests (Vitest)

- **Milestone 0:** existing ERD tests pass after the move. The generalised id generator and placement get their own tests (prefixes, collision retry, determinism, no overlap).
- **`flows/ops.ts`:** every operation, including:
  - each cascade in the table above
  - `deleteState` refusing the last state
  - `makeDefaultState` ordering
  - `entities` preserved across operations
  - no-op and same-object returns
  - blank optionals removed
  - every result passing `Flows`
  - inputs never mutated
- **`estimateScreenSize`** grows with states, sees items and CTAs.
- **Edge endpoint resolution** as a pure function: which handle a transition starts and ends at, covering explicit state, omitted state, a hidden single-state header, and a same-screen target.
- **Round trip:** apply an op, stringify, parse, and get an equal document. Renaming one CTA changes exactly one line of `stringifyFlows` output.

## Out of scope for phase 3

- Anything in the UI (preview) view (phase 4)
- Collapsing states, reordering states (beyond "make default"), sees items or CTAs
- Editing a screen's `entities` cross-reference, or any cross-file validation between `flows.json` and `erd.json`
- Retargeting a transition to a different screen from the popover
- Dead-end and orphan validation beyond hollow handles
- Undo/redo, dark mode, Mermaid export, and shortcuts beyond S, ⇧1, select, delete and Escape (phase 5)
- Auto-layout, minimap, copy/paste, duplicate
- Schema changes. If you think the schema needs one, stop and ask me.
- Server changes. None should be needed.
- ERD behaviour changes, beyond what the milestone 0 move unavoidably touches

## Milestones (one commit each, pushed)

0. **Promote shared pieces.** The moves and generalisations in section 0, with all ERD tests green and the ERD re-checked in the browser. No flow code yet.
1. **Flows canvas foundation.** `FlowsView` on `Canvas`, the second `useEditableDoc` in `Shell`, the toolbar with Add screen (S) and the empty state. Screens render as simple read-only boxes at their layout positions, unpositioned ones placed, and transitions as plain lines between screens.
2. **Operations.** `flows/ops.ts` and the full test suite above, all passing. No UI wiring yet.
3. **Screen card and transition edges — review gate.** The real screen card (single- and multi-state) and the routed transition arrows with labels, still read-only. **Stop here.** Show me screenshots, at 100% and about 50% zoom, of:
   - the phase 1 notes fixture (two two-state screens, a single-state screen, and one transition to a specific state)
   - a busier example of your own: six to eight screens, including one with three states × three sees items × four CTAs, a CTA with two conditional transitions, a same-screen loop and a dead-end CTA

   Wait for my go-ahead. This is where the density question gets judged, so expect changes.
4. **Editing screens.** Add, rename, notes, move and delete screens; add, rename, make default and delete states; inline editing of sees items and CTAs with Enter-to-continue and Tab navigation; cascade confirmations.
5. **Editing transitions.** Connect by dragging from a CTA, the popover (to-state, label, delete), filled/hollow handles, and multi-select delete across screens and transitions.
6. **Verified.** Walk the "done means" checklist below by hand, fix what it finds, and report the results.

## Done means

All of the following, demonstrated rather than asserted:

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass at the repo root.
- [ ] The ERD behaves exactly as at the end of phase 2.
- [ ] Opening the notes fixture shows Login (two states), Notes (two states) and Note editor (one state, no state header) at their layout positions. Its four transitions are drawn from the right CTAs to the right targets: t4 goes to Notes › List, and the others to the screen headers.
- [ ] An empty `flows.json` shows "No screens yet" with a working "Add screen S" button. **S** and double-clicking empty canvas both create a screen with its name ready to type.
- [ ] Using only the keyboard, I can name a screen, add notes, add three sees items and three CTAs (type, Enter, type, Enter…).
- [ ] I can add a second state, rename it, make it the default, and delete it again. I can't delete a screen's last state.
- [ ] Dragging from a CTA onto a state header creates a transition to that state; dropping elsewhere on a card targets the screen's default state. Dropping on empty canvas or on the CTA's own state does nothing.
- [ ] I can connect a CTA to another state of its own screen, and the loop is legible.
- [ ] I can draw two transitions from one CTA, label them "success" and "failure", and select each separately.
- [ ] In the popover I can switch a transition between "default state" and a specific state, label it, and delete it. `flows.json` shows `stateId` present or omitted accordingly.
- [ ] A CTA's handle is hollow with no transitions and filled with one.
- [ ] Deleting a state that has transitions into and out of it asks first. Afterwards the outgoing ones are gone, the incoming ones point to the default state, and the file validates.
- [ ] Deleting a screen with transitions asks first, and removes them and its layout entry.
- [ ] Dragging a screen and refreshing keeps its position. `git diff` on `flows.json` shows only that screen's `layout` entry changing.
- [ ] Renaming one CTA changes exactly one line in `flows.json`.
- [ ] A hand-added `entities` array on a screen survives editing that screen.
- [ ] With unsaved Flows edits, switching to ERD saves them first. Each view's save status is independent.
- [ ] A screen added to `flows.json` by hand without a `layout` entry is placed without overlap, and opening doesn't modify the file.
- [ ] A hand-broken `flows.json` shows the validation surface, with a warning dot on the Flows segment, and the ERD still works. Fixing it and pressing Reload brings the canvas back.
- [ ] Typing in any field on a card never pans, zooms, drags, deletes or triggers S.

When every box is ticked and committed, phase 3 is complete. Phase 4 (preview) starts in a new session.
