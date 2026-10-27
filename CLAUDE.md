# modelwright

A local design tool that produces a structured spec — an entity relationship diagram, a screen-flow chart and a live UI preview — for Claude Code to build an app from. It exists so that apps get designed through structure, logic and flows rather than prompted blindly.

## Current phase

**Phase 8 — UI feedback round 2.** See `docs/phase-8-brief.md`. Phases 1–7 are complete and merged. This phase builds items 25–36 of `docs/ui-feedback.md`: single-click and focus fixes, drag to reorder, alignment guides and ⌥-drag on both canvases, connector join points, and notes on CTAs and information items. It bumps `erd.json` to schemaVersion 2 and `flows.json` to 3.

Phases, in order:

1. Foundation — repo, schema package, shell with view toggle, open project and read/write `.design/`
2. ERD canvas — entity node with attribute editing, crow's-foot edges, add/delete/move, autosave
3. Flow canvas — screen node with CTA handles, connect to screens/states, arrow labels
4. Preview — iframe, device toggle, `config.json` URL
5. Polish — undo/redo, shortcuts, Mermaid/Markdown export, dark mode
6. Pipeline — the `/build-from-design` skill, first real project
7. Desktop — Electron wrap: shared core, IPC client, native dialogs and menu, preview emulation, packaged app
8. UI feedback round 2 — reorder, guides, ⌥-drag, join points, notes on CTAs and information items

## The two-repo rule

Two repos, one contract. **This repo never contains project code.** Each project designed with modelwright lives in its own repo and gets a `.design/` folder:

```
my-project/
  .design/
    config.json      # preview URL / dev command, device presets
    erd.json         # entities, attributes, relationships
    flows.json       # screens, states, CTAs, transitions
  src/ ...           # whatever stack the project uses
```

modelwright is stack-agnostic because it only ever touches `.design/` and a URL. The design files version alongside the project's code, and Claude Code can read them directly from the project repo.

## Architecture

```
modelwright/
  CLAUDE.md
  packages/schema/      # types + zod validators + migrations (shared by everything)
  packages/spec/        # spec.md generation and the design diff
  packages/project/     # project rules and .design/ file I/O (shared with the CLI)
  packages/core/        # every project operation, transport-free: open, init, create,
                        #   recents, read/write, build record, preview check, watch, demo,
                        #   and projects' dev servers (devServer.ts: approval, process groups, log)
    src/contract.ts     # pure: error codes, argument schemas (zod), preview layout
    src/ipc.ts          # pure: IPC channels and the preload's DesktopApi type
  packages/cli/         # modelwright-design, bundled into plugins/modelwright/bin/
  packages/client-contract/  # the ProjectClient contract suite, run against both clients
  apps/web/             # Vite + React + React Flow: the UI, in both builds
    src/platform/       # ProjectClient → httpClient (web) and ipcClient (desktop); the desktop host
  apps/server/          # Hono adapter over the core, for the web build (4300/4301)
  apps/desktop/         # Electron (electron-vite): main hosts the core over IPC, preload,
                        #   menu, dialogs, Dock, preview (WebContentsView); renderer = apps/web
  plugins/modelwright/  # the Claude Code plugin: build-from-design skill and CLI
  brand/                # icon and marks
  design-refs/          # Claude Design exports for Claude Code to match
  docs/                 # decisions.md, ui-feedback.md, using-modelwright.md, phase briefs
```

### Platform boundary

Everything in the UI that touches disk goes through the `ProjectClient` interface in `apps/web/src/platform/`. It has two implementations:

- **`httpClient`** in the web build, talking to `apps/server`
- **`ipcClient`** in the desktop app, talking to Electron's main process through the preload's `window.modelwright`

`createDefaultClient()` picks one. Both transports are thin adapters over `packages/core`: no project logic in Hono routes or IPC handlers beyond mapping arguments and errors. The same contract suite (`packages/client-contract`) runs against both clients. Capabilities only one build has (folder dialogs) are reported by `ProjectClient.capabilities`, so the UI shows only what works. The desktop app's menu, Dock, quit and preview go through `platform/host.ts` (`desktopHost()`, null in the web build).

**Never import `fetch`, Node `fs`, server URLs, `@modelwright/core` (Node) or a client implementation from a React component.** Lint enforces it.

### Desktop security

The window is context-isolated and sandboxed, with no Node and no webview. The preload exposes one narrow API, never `ipcRenderer`. Main checks each call's sender and validates every argument with the core's zod schemas before any handler runs. Navigation away from modelwright's own pages is denied, and web links open in the default browser. The renderer is served from `app://modelwright` with a strict CSP (no inline scripts). The preview is a separate `WebContentsView` in its own session, loading only http(s) URLs.

### Shortcuts and the menu

`apps/web/src/shortcutRegistry.ts` lists every shortcut; `menuSpec.ts` is the desktop menu as data. Handlers, hints, the overlay and the native menu all read them, and a test checks the menu and registry agree. Combos only the desktop app can have (⌘R, ⌘N, ⌘O, ⌘W, ⌘1–3) are `host: 'desktop'`, and hints follow the hint rule per build.

### The schema package is the contract

`packages/schema` is written and locked first. It owns the TypeScript types, zod validators and migrations for `erd.json`, `flows.json` and `config.json`. Every file read is validated on load; every write is validated before it hits disk. Changing a schema means bumping `schemaVersion` and shipping a migration in the same package — never editing types in place.

### Meaning is separate from layout

In `erd.json` and `flows.json`, the semantic block (`entities`/`relationships`, `screens`/`transitions`) is separate from `layout: { [nodeId]: { x, y } }`. Diffs stay readable and Claude Code can edit the semantic block without wrecking canvas positions.

## Stack

- pnpm workspaces, TypeScript everywhere, strict mode
- `packages/schema`: zod, Vitest
- `apps/web`: Vite 8, React, TypeScript, React Flow (`@xyflow/react`) with `panOnScroll` and pinch-to-zoom, so it behaves like Figma on a trackpad
- `apps/server`: Hono on Node
- `apps/desktop`: Electron 44 with electron-vite 5 (on Vite 7 until electron-vite 6 is stable), electron-builder, Playwright for end-to-end tests
- `pnpm dev` runs the web build: web (4300) and server (4301), with Vite proxying `/api`
- `pnpm dev:desktop` runs the desktop app from source, with its renderer on 4302 and HMR
- `pnpm package` builds `apps/desktop/dist/modelwright-<version>-arm64.dmg`, ad-hoc signed for this Mac
- `pnpm e2e:desktop` runs the Playwright Electron tests against `out/`, and `pnpm e2e:packaged` against the packaged app. Each run gets a temp `MODELWRIGHT_HOME`

## Working conventions

- One phase per session. Start in plan mode. Commit at each milestone.
- Vitest coverage is required on `packages/schema`, `packages/core`, the IPC layer and anything pure. The canvas is tested by eye against `design-refs/`, in the web build through the browser pane. The desktop app is tested with Playwright's Electron support and by hand.
- Before declaring a task done, run `pnpm test`, `pnpm typecheck` and `pnpm lint` and report the result.
- Where a `design-refs/` export exists for a piece of UI, match it rather than inventing a look. Use the browser tool to compare visually.
- Log any decision that changes the approach in `docs/decisions.md` with the reasoning.
- The web build keeps its trade-offs, and the desktop app is where they're fixed (don't "fix" these in the web build): the picker has no folder dialog (a pasted path instead), the mobile preview is width-only with no user agent or touch, and the browser keeps ⌘R and friends.
