# modelwright

A local design tool that produces a structured spec — an entity relationship diagram, a screen-flow chart and a live UI preview — for Claude Code to build an app from. It exists so that apps get designed through structure, logic and flows rather than prompted blindly.

## Current phase

**Phase 5 — Polish.** See `docs/phase-5-brief.md`. Phases 1–4 (foundation, ERD canvas, flow canvas, preview) are complete and merged. This phase adds undo/redo, shortcuts, file watching, the generated `.design/spec.md` and dark mode. Do not start phase 6 work until phase 5's "done means" has been verified and committed.

Phases, in order:

1. Foundation — repo, schema package, shell with view toggle, open project and read/write `.design/`
2. ERD canvas — entity node with attribute editing, crow's-foot edges, add/delete/move, autosave
3. Flow canvas — screen node with CTA handles, connect to screens/states, arrow labels
4. Preview — iframe, device toggle, `config.json` URL
5. Polish — undo/redo, shortcuts, Mermaid/Markdown export, dark mode
6. Pipeline — the `/build-from-design` skill, first real project

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
  apps/web/             # Vite + React (+ React Flow from phase 2)
    src/platform/       # ProjectClient interface → httpClient now, ipcClient later
  apps/server/          # small Hono server: open project, read/write .design/*, recents
  design-refs/          # Claude Design exports for Claude Code to match
  docs/                 # decisions.md, phase briefs
```

### Platform boundary

Everything in the UI that touches disk goes through the `ProjectClient` interface in `apps/web/src/platform/` (`openProject`, `readDesign`, `writeDesign`, `listRecent`). The web build uses an HTTP implementation talking to `apps/server`. Electron later means one new implementation (`ipcClient`) hosting the same handlers in the main process — a swap, not a rewrite. **Never import `fetch`, Node `fs`, or server URLs from a React component.**

### The schema package is the contract

`packages/schema` is written and locked first. It owns the TypeScript types, zod validators and migrations for `erd.json`, `flows.json` and `config.json`. Every file read is validated on load; every write is validated before it hits disk. Changing a schema means bumping `schemaVersion` and shipping a migration in the same package — never editing types in place.

### Meaning is separate from layout

In `erd.json` and `flows.json`, the semantic block (`entities`/`relationships`, `screens`/`transitions`) is separate from `layout: { [nodeId]: { x, y } }`. Diffs stay readable and Claude Code can edit the semantic block without wrecking canvas positions.

## Stack

- pnpm workspaces, TypeScript everywhere, strict mode
- `packages/schema`: zod, Vitest
- `apps/web`: Vite, React, TypeScript. React Flow (`@xyflow/react`) arrives in phase 2 — set `panOnScroll` with pinch-to-zoom so it behaves like Figma on a trackpad
- `apps/server`: Hono on Node
- `pnpm dev` runs web and server together; Vite proxies `/api`

## Working conventions

- One phase per session. Start in plan mode. Commit at each milestone.
- Vitest coverage is required on `packages/schema` and the server's file I/O layer. The canvas (phase 2+) is tested by eye against `design-refs/`.
- Before declaring a task done, run `pnpm test` and `pnpm typecheck` and report the result.
- Where a `design-refs/` export exists for a piece of UI, match it rather than inventing a look. Use the browser tool to compare visually.
- Log any decision that changes the approach in `docs/decisions.md` with the reasoning.
- Accepted v1 trade-offs (don't "fix" these in the web build): project picker is a recents list plus a pasted path; mobile preview is viewport-width only, no user-agent override. Electron fixes both later.
