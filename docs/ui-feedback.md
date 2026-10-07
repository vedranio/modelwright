# UI feedback

Changes to make to modelwright's UI, collected from use. Items 1–12 were built on 7 October 2026 on `phase-6` (commits A–D, see `docs/decisions.md`). New items go at the end of their section.

## Flows

1. **Single click to edit information items.** _Done (commit A)._ When editing a screen's information items, a single click on an item should enter edit mode.
2. **Highlight the default state when dropping a connector on a single-state screen.** _Done (commit A)._ When dragging a connector to another screen that has no other states, highlight its default state wherever on the screen the pointer is.
3. **Bigger target for selecting connectors.** _Done (commit A)._ Selecting a connector on a screen is too fiddly. Make the target area larger.
4. **Connecting from some CTAs doesn't work.** _Done (commit A)._ Creating a connector from some CTAs fails, and it isn't clear why. Needs investigating to find which CTAs and the cause.
5. **Drop a connector on the canvas to create a screen.** _Done (commit A)._ Dragging a screen connector and dropping it on empty canvas should create a new screen at that spot, connected to it.
6. **Mark one CTA as primary.** _Done (commit C)._ Each state needs an easy way to mark its primary CTA, similar to "make default" for states. Only one CTA per screen state can be primary.
   - Needs a schema change (a `schemaVersion` bump and a migration), and the build skill and `spec.md` should use it, e.g. render the primary CTA as the main button.
7. **Connect on either side of a card.** _Done (commit B)._ Connectors should be able to leave a CTA, and arrive at a screen or state, on either side of the card (left or right). Take the shortest path between the two cards.
8. **Notes on states.** _Done (commit C)._ Allow notes on individual states, not just on the screen.
   - Needs a schema change, like item 6, and the notes should reach `spec.md` and the build.
9. **Highlight a connector and its two ends.** _Done (commit A)._ Hovering a connector highlights the line, its source CTA and its destination screen or state. Selecting it keeps the same highlighting.

## ERD

10. **Never place a new entity on top of another.** _Done (commit A)._ Adding an entity shouldn't put it in the middle of the screen on top of an existing one. Place it to the right of the last entity added, or of the selected entity. Entities must never overlap.
11. **Drop a connector on the canvas to create an entity.** _Done (commit A)._ Dragging an entity connector and dropping it on empty canvas should create a new entity at that spot, connected to it.

## Saving

12. **Detect a stopped server, and have Retry restart it.** _Done (commit D): detected and explained, saving retries by itself; restarting needs Electron._ When ERD or Flows can't be saved because the modelwright server isn't running, the app should say so, and Retry should restart the server.
    - In the web build, the page can't start a process, because the server is the only thing that can. Detecting it and saying "modelwright's server isn't running — start it with `pnpm dev`" is possible now. Restarting from Retry needs a process supervisor: Electron's main process, or a small launcher that keeps the server alive.

## Flows and ERD

14. **Arrow cursor on empty canvas.** _Done (commit E)._ The default pointer on empty canvas is the standard arrow. Only selectable or editable things (cards, their text, connectors) show a pointing hand.
15. **Hover highlights a connector and both ends, on both canvases.** _Done (commit E)._ Hovering a connector highlights it and the two items it connects. Flows already lit the source CTA and target state; the ERD now lights both entities.
16. **A stronger selected connector.** _Done (commit E)._ A selected connector is thicker as well as accent-coloured.
18. **Keep a connector's details card in view.** _Done (commit F)._ Selecting a connector sometimes put its details card out of view. It must show where it can be seen.

## Help

17. **Help in two tabs.** _Done (commit E)._ "How it works" explains what happens in modelwright and what happens in the AI coding tool, and where they meet. "Keyboard shortcuts" is the old overlay.
18b. **Explain where visual design happens.** _Done (commit G)._ "How it works" should say how the UI is designed (in an AI design tool such as Claude Design, then applied by the coding tool) and that the UI tab is for previewing, not designing.

## Project picker

19. **Create a project, not just open one.** _Done (commit H)._ The picker's left panel puts creating a project first. The right panel splits into recent projects (up to five) on top and a button to open an existing project below.
20. **Material icons for the picker's key hints.** _Done (commit I)._ The recents hint uses Google's `sync_alt` arrows turned to point up and down for "choose", and `keyboard_return` for "open"; every ↵ on the picker's buttons is `keyboard_return` too.
21. **Ship a demo project.** _Done (commit J)._ A first install lists one demo project, a simple todo list, under "Demo project". Once the user has projects of their own the heading is "Recent projects", and the demo stays in the list until it's dismissed or drops off.

## Follow-ups

13. **Keep unsaved edits across a page reload.** When `pnpm dev` stops and comes back, Vite's dev client reloads the page as soon as it reconnects, often before the automatic retry has saved, and unsaved edits are lost unless the browser's "leave page?" prompt is cancelled. Keeping each dirty working copy in session storage and restoring it after a reload would make this safe. Found while verifying item 12.
