# UI feedback

Changes to make to modelwright's UI, collected from use. Not implemented yet: each item gets planned and built in a later session. Add new items at the end of their section.

## Flows

1. **Single click to edit information items.** When editing a screen's information items, a single click on an item should enter edit mode.
2. **Highlight the default state when dropping a connector on a single-state screen.** When dragging a connector to another screen that has no other states, highlight its default state wherever on the screen the pointer is.
3. **Bigger target for selecting connectors.** Selecting a connector on a screen is too fiddly. Make the target area larger.
4. **Connecting from some CTAs doesn't work.** Creating a connector from some CTAs fails, and it isn't clear why. Needs investigating to find which CTAs and the cause.
5. **Drop a connector on the canvas to create a screen.** Dragging a screen connector and dropping it on empty canvas should create a new screen at that spot, connected to it.
6. **Mark one CTA as primary.** Each state needs an easy way to mark its primary CTA, similar to "make default" for states. Only one CTA per screen state can be primary.
   - Needs a schema change (a `schemaVersion` bump and a migration), and the build skill and `spec.md` should use it, e.g. render the primary CTA as the main button.
7. **Connect on either side of a card.** Connectors should be able to leave a CTA, and arrive at a screen or state, on either side of the card (left or right). Take the shortest path between the two cards.
8. **Notes on states.** Allow notes on individual states, not just on the screen.
   - Needs a schema change, like item 6, and the notes should reach `spec.md` and the build.
9. **Highlight a connector and its two ends.** Hovering a connector highlights the line, its source CTA and its destination screen or state. Selecting it keeps the same highlighting.

## ERD

10. **Never place a new entity on top of another.** Adding an entity shouldn't put it in the middle of the screen on top of an existing one. Place it to the right of the last entity added, or of the selected entity. Entities must never overlap.
11. **Drop a connector on the canvas to create an entity.** Dragging an entity connector and dropping it on empty canvas should create a new entity at that spot, connected to it.

## Saving

12. **Detect a stopped server, and have Retry restart it.** When ERD or Flows can't be saved because the modelwright server isn't running, the app should say so, and Retry should restart the server.
    - In the web build, the page can't start a process, because the server is the only thing that can. Detecting it and saying "modelwright's server isn't running — start it with `pnpm dev`" is possible now. Restarting from Retry needs a process supervisor: Electron's main process, or a small launcher that keeps the server alive.
