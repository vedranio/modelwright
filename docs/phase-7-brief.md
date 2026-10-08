# modelwright — Phase 7 brief: Desktop

Read `CLAUDE.md` and `docs/decisions.md` first. They are the standing context. Everything decided in phases 1–6 still holds, in particular:

- the two-repo rule: this repo never contains project code
- modelwright writes only inside `.design/`, with the logged exception for creating a new project folder
- the platform boundary: everything that touches disk goes through `ProjectClient`
- the schema package is the contract
- the hint rule: a keyboard hint shows only for a shortcut that works
- every visual value comes from `tokens.css`

---

## What you are building

Phases 1–6 built modelwright as a local web app: a Vite page talking to a small Hono server, started with `pnpm dev`. This phase wraps it as a **macOS desktop app** that I install once and open from the Dock, so that I can use it on real projects without a terminal running.

Decision 1 in `docs/decisions.md` planned this from the start: Electron, with the disk layer swapped behind `ProjectClient` rather than the app rewritten. Electron also removes the web build's accepted trade-offs:

1. **A real folder picker** for opening and creating projects, instead of a pasted path.
2. **A preview that emulates a device,** user agent included, not just a narrower frame.
3. **No server to stop.** Saving can't fail because `pnpm dev` isn't running (UI feedback item 12), and a dev server reload can't throw away unsaved edits (follow-up 13).
4. **Shortcuts the browser kept,** through a native application menu: ⌘R (reload the design), ⌘D, ⌘1–3 and the rest.

Four pieces:

1. **A transport-free core.** The server's handlers (open, init, create, recents, read, write, watch, build record, preview check, the demo) move into one module that both the Hono server and Electron's main process call.
2. **`apps/desktop`:** an electron-vite app whose main process hosts the core over IPC, with a preload that exposes a typed API, an `ipcClient` implementing `ProjectClient`, and the existing `apps/web` as its renderer.
3. **Native integration:** folder dialogs, the application menu, window state, external links, and the preview's device emulation.
4. **A packaged app:** a `.app` in a `.dmg`, built from this repo, that I install in /Applications.

The plugin, the skill and the `modelwright-design` CLI don't change, except where the preview's framing rules do (see section 4).

## How to work

1. Start in plan mode. Read the current Electron and electron-vite documentation before planning: security guidance, context isolation, the preload and IPC patterns, `WebContentsView` and `<webview>`, the `session` and `webRequest` APIs, and packaging. Where the docs differ from this brief, the docs win; tell me.
2. Before writing the plan, interview me on anything in this brief that is ambiguous or that you'd decide differently, in particular the decisions listed under "Decisions this brief makes". Then present the plan and wait for approval.
3. Check `design-refs/` and `brand/` before planning and tell me what you find. The app icon is `brand/modelwright.icns`, made from `brand/modelwright-icon-1024.png`. `brand/` isn't committed yet; commit it with the first milestone that uses it.
4. Work milestone by milestone (listed at the end). Commit at each one and push the branch.
5. Respect the two review gates: after milestone 3 (native integration and the preview) and after milestone 4 (the packaged app on my machine). Stop there and wait for me.
6. Vitest is required on the core, the IPC layer and anything pure (see "Tests"). The web build is still verified in the browser pane; the desktop app is verified with Playwright's Electron support and by me.
7. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before declaring any milestone done and report the results.
8. Once the interview has settled the decisions below, log them in `docs/decisions.md`, plus any others you make along the way.

## Scope

### 1. A transport-free core

Today `apps/server/src/app.ts` mixes three things: the HTTP layer (routes, the origin/host guard, SSE), the project rules, and Node file I/O (some of it already in `packages/project`).

- **Move every handler's logic into one core,** with plain async functions and typed results: open, init, create, list/remove recents, read/write a design file (validation, canonical writes, `spec.md` regeneration), read the build record, check a preview URL, watch a project, and offer the demo. Errors are typed values that each transport maps onto its own wire format: HTTP status codes for the server, serialised errors for IPC.
- **The Hono server becomes a thin adapter** over the core, and behaves exactly as now. Its existing tests keep passing unchanged. That's the proof the move changed nothing.
- **Where the core lives** (a new `packages/core`, or `packages/project`'s node side) is for the plan.
- **One contract test suite** for `ProjectClient` runs against both implementations: `httpClient` over the server, and `ipcClient` over the main-process handlers with a fake IPC channel. Same cases, same expectations.

### 2. `apps/desktop`

- **electron-vite,** as decision 1 planned, with three entries: main, preload and renderer. The renderer is `apps/web`'s app, not a copy. Only `createDefaultClient()` changes, choosing `ipcClient` when the preload's API is present.
- **Security as the Electron docs recommend:**
  - `contextIsolation` on, `nodeIntegration` off, and the renderer sandboxed
  - a strict CSP for modelwright's own pages
  - navigation and new windows denied, except for the preview
  - the preload exposes one narrow, typed API, never `ipcRenderer` itself
  - the main process validates every IPC argument before acting on it (zod, as the server does)
- **IPC:**
  - one `invoke` channel per `ProjectClient` method
  - `watchDesign` as events pushed from main, with unsubscribing releasing the watcher
  - `checkPreview` runs in main, as it runs in the server now
- **The renderer is served** from a custom protocol (e.g. `app://modelwright`) in the packaged app, and from electron-vite's dev server with HMR in development.
- **One window, one project at a time,** as now. Window size, position and the last view are remembered.
- **`MODELWRIGHT_HOME`** (`~/.modelwright`) is shared with the web build, so both see the same recents and demo.

### 3. Native integration

- **Folder dialogs:**
  - the picker's "Open an existing project" opens a native folder dialog
  - the create form's Location field gets a "Choose…" button
  - the pasted-path field stays as a fallback
  - `ProjectClient` gains the dialog methods, and the web build's `httpClient` reports them unavailable, so the picker shows only what works
- **The application menu,** generated from the shortcut registry so that menu, handlers and hints can't disagree:
  - **File:** New Project, Open…, Open Recent, Close Project
  - **Edit:** Undo/Redo route to the canvas when it has focus, and to the text field when one does
  - **View:**
    - ERD, Flows and UI (⌘1–3)
    - Reload Design (⌘R)
    - Reload Preview
    - zoom
    - toggle theme
  - **Help:** How it works, and Keyboard shortcuts
  - ⌘R and ⌘D come back, with their hints, under the hint rule.
- **External links** ("Open in browser", links in Help) open in the default browser.
- **Theme:** System follows `nativeTheme`. The title bar is native or `hiddenInset` with the header as its drag region; that's for the plan.
- **Dock and app menu:** recent projects in the Dock menu, and opening a folder dropped on the Dock icon.

### 4. The preview in Electron

- **Device emulation:** the Mobile preset emulates a phone (viewport, device scale factor, a mobile user agent and touch). Desktop clears it. Which surface does it is for the interview: an `<iframe>` with the user agent set through `session.webRequest`, a `<webview>`, or a `WebContentsView` placed over the preview area.
- **Framing:** an Electron app can show the user's own local dev server even when it sends `X-Frame-Options` or `frame-ancestors`, by removing those headers for the preview's origin only. If we do, the "refuses to be embedded" card shows only in the web build, and the skill's framing rule (`SKILL.md` step 3) can relax for desktop users. If we don't, the preview check has to know the desktop app's origin.
- **Errors:** "can't reach the dev server" and the other preview states behave as in the web build.

### 5. Packaging

- **A local build command** (e.g. `pnpm package`) produces `modelwright.app` in a `.dmg` for Apple silicon, with the app icon, name and version.
- **Signing:** see the decisions below. The build is either ad-hoc signed for this Mac, or signed and notarised with a Developer ID.
- **The packaged app** runs with no repo checkout and no `pnpm`. Everything it needs is inside the bundle.

### 6. Documentation

- **`docs/using-modelwright.md`:**
  - installing and updating the desktop app
  - what changes for desktop users (folder dialogs, the menu, the preview)
  - the web build as the development harness
- **`README.md`:** the desktop app first, the web build for development.
- **`CLAUDE.md`:**
  - the architecture diagram with `apps/desktop` and the core
  - the platform boundary now having two implementations
  - how to run, test and package the desktop app

## Decisions this brief makes

Challenge any of these in the interview. Once settled, log them in `docs/decisions.md`.

- **Electron with electron-vite,** as decision 1 planned, rather than Tauri. The core is Node, and Tauri would mean rewriting it in Rust or shipping Node as a sidecar.
- **The web build stays** as the development and test harness. Claude Code verifies UI in its browser pane, which can't drive an Electron window. It keeps ports 4300 and 4301. The desktop app opens no ports at all.
- **One core, two transports.** No handler logic in the Hono routes or the IPC handlers beyond mapping arguments and errors.
- **macOS on Apple silicon only.** Windows and Linux aren't built or tested.
- **Ad-hoc signed, not notarised,** unless you have an Apple Developer ID. An ad-hoc build runs on this Mac after a one-time "Open anyway" in System Settings, and can't be handed to anyone else. Notarising needs a paid developer account.
- **Updates are manual:** rebuild and reinstall. No auto-update this phase.
- **The preview removes frame-blocking headers** for the preview's origin in the desktop app, so any local dev server can be previewed.
- **One window, one project,** as in the web build.
- **Starting the project's dev server from modelwright stays out of scope,** although `config.json` records the command. It's the obvious next convenience. Challenge this if you'd rather have it now.

## Tests

- **The core:** every handler against temp directories, carried over from the server's tests. They cover validation, canonical writes, `spec.md` regeneration, the write rule (`.design/` only, plus project creation), recents, the demo, the build record and the watcher.
- **The server adapter:** the existing server tests pass unchanged.
- **The `ProjectClient` contract suite,** run against `httpClient` and `ipcClient`.
- **IPC argument validation:** malformed arguments are rejected in main and reach no handler.
- **The menu:** every menu item with an accelerator matches a registry shortcut, and the reverse.
- **Preview header filtering** as a pure function: only the preview's origin is affected, and only the frame-blocking headers are removed.
- **A Playwright Electron smoke test** of the built app:
  - launches it and opens a temp project
  - edits an entity and sees the file change
  - switches views
  - quits

## Out of scope for phase 7

- Windows and Linux builds
- Auto-update, and publishing builds anywhere, the Mac App Store included
- Notarisation, unless settled otherwise in the interview
- Starting or stopping the project's dev server from modelwright
- Several windows or projects at once
- Running Claude Code or the skill from inside modelwright
- Changes to the design schemas, the diff, `build.json` or the CLI's commands
- New editing features on the canvases

## Milestones (one commit each, pushed)

0. **Core.** The handlers moved into the core, the server rebuilt as an adapter over it, and the `ProjectClient` contract suite passing against `httpClient`.
1. **Desktop shell.** `apps/desktop` with main, preload and `ipcClient`, the renderer running in a window in development with HMR, and the contract suite passing against `ipcClient`. Every view works in the window.
2. **Native integration.** Folder dialogs, the application menu with ⌘R and ⌘D back, external links, window state, theme, and the Dock.
3. **Preview — review gate.** Device emulation and framing. **Stop here.** In the dev build, show me:
   - the picker's folder dialogs
   - the menu
   - the preview on PhotoBackup's renderer and on a dev server that sends `X-Frame-Options: DENY`, at Mobile and Desktop, with the user agent the page reports

   Wait for my go-ahead.
4. **Packaged — review gate.** `pnpm package`, the `.dmg`, the icon and the Playwright smoke test. **Stop here.** Give me the steps to install it, open it the first time, and open `~/Code/photobackup`. I use it with no terminal running. Wait for my go-ahead.
5. **Docs and verified.** `docs/using-modelwright.md`, `README.md` and `CLAUDE.md`. Walk the "done means" checklist below, fix what it finds, and report the results.

## Done means

All of the following, demonstrated rather than asserted:

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass at the repo root, and the Playwright Electron smoke test passes on the packaged app.
- [ ] The server's tests pass unchanged, and the `ProjectClient` contract suite passes against both clients.
- [ ] `pnpm dev` still runs the web build exactly as before, at http://127.0.0.1:4300.
- [ ] The packaged app installs from its `.dmg` into /Applications and opens from the Dock, with no repo checkout, `pnpm` or terminal involved.
- [ ] Opening an existing project and creating one both use native folder dialogs. The pasted path still works.
- [ ] Every editing feature from phases 2–6 works in the app: ERD, Flows, undo/redo, toasts, file watching with the conflict banner, the build indicator and Revert all.
- [ ] The menu's shortcuts all work, ⌘R and ⌘D included, and their hints show. Every shortcut in the overlay works in the app.
- [ ] Editing `.design/erd.json` in a text editor while the app is open updates the canvas, as in the web build.
- [ ] The Mobile preview reports a mobile user agent and a phone viewport. A dev server that sends `X-Frame-Options: DENY` previews in the app.
- [ ] The app writes nothing outside `.design/` and `~/.modelwright`, except when creating a project.
- [ ] Malformed IPC calls are rejected, and the renderer has no Node access (checked from its devtools console).
- [ ] Quitting with unsaved edits saves them, or asks, as closing a project does in the web build.
- [ ] Recents and the demo are shared between the web build and the app.
- [ ] `docs/using-modelwright.md` lets me install, update and use the app without this brief.

## Hand checks for me

Things automation can't prove. List them in your final report so I can check them on my machine:

- trackpad pan, pinch zoom and Shift-click in the app's canvases
- the System theme following a live appearance change
- dragging a project folder onto the Dock icon
- the first-launch "Open anyway" step for an ad-hoc build, if that's what we chose
- a real project, start to finish, in the app

When every box is ticked and committed, phase 7 is complete. Real projects are built with the desktop app from then on.
