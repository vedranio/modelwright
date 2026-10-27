# modelwright — Phase 8 brief: UI feedback round 2

Read `CLAUDE.md` and `docs/decisions.md` first. They are the standing context. Everything decided in phases 1–7 still holds, in particular the two-repo rule, the platform boundary, the schema package as the contract, meaning separate from layout, the hint rule, and every visual value coming from `tokens.css`.

---

## What you are building

Items 25–36 in `docs/ui-feedback.md`, logged from daily use of the desktop app. Item 13 (restoring unsaved edits after a web-build page reload) stays a follow-up: it only affects the web build, which is now the development harness.

| Item | Change | Canvases |
| --- | --- | --- |
| 25 | An open field comes back after switching to another app and back | both |
| 26 | Single click edits text on an entity card | ERD |
| 27 | A selection box selects every card it touches | both |
| 28 | Reorder an entity's attributes by dragging | ERD |
| 29 | Move where a connector joins a card | both |
| 30 | A new relationship starts with the last cardinality used | ERD |
| 31 | Alignment guides and live snapping while dragging cards | both |
| 32 | ⌥-drag duplicates the dragged cards | both |
| 33 | A connector stays attached where it was drawn from | both |
| 34 | Reorder a screen's states by dragging | Flows |
| 35 | Notes on CTAs | Flows |
| 36 | Notes on information items | Flows |

## Decisions this brief makes

Settled in planning on 27 October 2026:

1. **Reordering is by dragging a grip** that shows on row hover, for attributes, states, information items and CTAs. ⌥↑/⌥↓ stays. A state dragged to the top becomes the default, as ⌥↑ already does.
2. **Join points remember side and position.** On the ERD, each end of a relationship may store a side (top, right, bottom, left) and a position along it (0–1). On Flows, a CTA row and the target state fix the height, so each end stores only its side (left or right). Ends never set stay automatic.
3. **Snapping is live, like Figma.** The card jumps onto a guide while dragging, so the drop lands where it shows. Edges and centres align, horizontally and vertically, within about 6 screen pixels. Holding ⌘ while dragging turns snapping off.
4. **Single click edits entity text,** as it already does on screen cards. This supersedes "Entity cards stay double-click" (2026-10-07).
5. **Notes on information items and CTAs aren't on the Tab path,** like state notes, so keyboard entry from item to item stays fast.
6. **One schema bump per file:** `erd.json` 1 → 2 (an `anchors` block) and `flows.json` 2 → 3 (an `anchors` block, CTA notes, and information items as `{ id, text, note? }` objects). The design diff still lines information items up by text, so existing build records keep diffing.

## Milestones

0. Setup: this brief, the `phase-8` branch, CLAUDE.md's current phase.
1. Small canvas fixes: items 25, 26, 27, 30.
2. Drag to reorder: items 28, 34, plus information items and CTAs.
3. Dragging cards: items 31, 32.
4. Schema changes, spec, diff, fixtures, demo, skill and CLI.
5. Notes on information items and CTAs: items 35, 36.
6. Join points: items 33, 29.
7. Verify, package and open a PR.

Commit at each milestone. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before each commit and report the results.

## Done means

- Every item in the table works in the desktop app and the web build, on both canvases where the table says so, in light and dark.
- A project whose `.design/` files are at the old versions (erd 1, flows 2) opens, shows correctly, and is saved at the new versions with nothing lost. `spec.md` and the design diff cover the new notes, and a build record made before this phase still diffs.
- The bundled CLI is rebuilt and the plugin's drift test passes.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e:desktop` and `pnpm e2e:packaged` pass, and a new `.dmg` is built.
- Items 25–36 are marked done in `docs/ui-feedback.md`, and the decisions are logged in `docs/decisions.md`.
- Anything that simulated input can't prove (snapping feel, ⌥-drag, a real trackpad) is listed for a check by hand.

## Compatibility

Older builds refuse the new files ("written by a newer modelwright"). Install the new `.dmg` and update the plugin's bundled CLI before the next `/build-from-design`. Each project's files upgrade the next time they're saved.
