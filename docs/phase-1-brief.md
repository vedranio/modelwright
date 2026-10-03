# modelwright — Phase 1 brief: Foundation

Paste this into Claude Code from the root of the `modelwright` repo, in plan mode. Read `CLAUDE.md` and `docs/decisions.md` first; they are the standing context this brief builds on.

---

## What you are building

modelwright is a local design tool that produces a structured spec — an entity relationship diagram, a screen-flow chart and a live UI preview — for Claude Code to build an app from. It lets apps be designed through structure, logic and flows rather than prompted blindly.

The tool and the projects it designs live in separate repos. This repo never contains project code. Each project gets a `.design/` folder containing `config.json`, `erd.json` and `flows.json`; modelwright reads and writes that folder and nothing else in the project.

**Phase 1 is foundation only.** Scaffold the monorepo, write and lock the schema package, build the server's read/write/recents endpoints, build the web shell with the three-way view toggle and the project picker, and prove a load/save round trip. **No canvas.** React Flow is phase 2 and must not be added in this phase.

## How to work

1. Start in plan mode. Before writing the plan, interview me on anything in this brief that is ambiguous or that you'd decide differently. Then present the plan and wait for approval.
2. Work milestone by milestone (listed at the end). Commit at each one with a clear message.
3. Vitest coverage is required on `packages/schema` and on the server's file I/O. Run `pnpm test` and `pnpm typecheck` before declaring any milestone done and report the result.
4. If `design-refs/` contains an export for the shell or the picker, match it. If it doesn't yet, keep styling minimal and neutral — system font stack, no component library, no design investment — so it's cheap to restyle in phase 2 when the refs exist.
5. Log any decision that changes the approach in `docs/decisions.md`.

## Repo layout

```
modelwright/
  CLAUDE.md
  docs/
    decisions.md
    phase-1-brief.md
  packages/schema/        # @modelwright/schema — types, zod validators, migrations, defaults
  apps/web/               # @modelwright/web — Vite + React + TypeScript
    src/platform/         # ProjectClient interface + httpClient
  apps/server/            # @modelwright/server — Hono on Node
  design-refs/            # Claude Design exports (may be empty in phase 1)
```

Tooling: pnpm workspaces, TypeScript strict everywhere, ESLint + Prettier, Vitest, `.nvmrc` pinned to the installed Node LTS. Root scripts: `pnpm dev` (runs web and server together; Vite proxies `/api` to the server), `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## The v1 contract (`packages/schema`)

This is the heart of phase 1. Write it first, test it, and treat it as locked once I've reviewed it.

### `.design/erd.json` — conceptual ERD

```ts
{
  schemaVersion: 1,
  entities: [{
    id: string,
    name: string,
    description?: string,
    attributes: [{ id: string, name: string, note?: string }]
  }],
  relationships: [{
    id: string,
    from: entityId,
    to: entityId,
    fromCard: 'one' | 'zero-one' | 'many' | 'zero-many',
    toCard:   'one' | 'zero-one' | 'many' | 'zero-many',
    label?: string
  }],
  layout: { [entityId]: { x: number, y: number } }
}
```

Attributes are objects, not strings, so going physical later is additive: bump to `schemaVersion: 2`, add `type`, `key`, `nullable`, ship a migration. No rewrite.

### `.design/flows.json` — screens with states inside

```ts
{
  schemaVersion: 1,
  screens: [{
    id: string,
    name: string,
    notes?: string,
    entities?: string[],              // optional cross-ref to erd entity ids; not validated across files in v1
    states: [{                        // always ≥ 1; the first is the default state
      id: string,
      name: string,
      sees: string[],                 // what the user can see
      ctas: [{ id: string, label: string }]   // what the user can do
    }]
  }],
  transitions: [{
    id: string,
    from: { screenId, stateId, ctaId },
    to:   { screenId, stateId? },     // omit stateId → the target screen's default state
    label?: string
  }],
  layout: { [screenId]: { x: number, y: number } }
}
```

### `.design/config.json` — project config

The approach specifies this only as "preview URL / dev command, device presets". Keep it minimal:

```ts
{
  schemaVersion: 1,
  name: string,                                   // display name for the project
  preview: { url?: string, devCommand?: string }, // v1 reads url only; devCommand is recorded for later
  devices?: [{ id: string, name: string, width: number, height?: number }]
  // when absent, the tool uses built-in presets: mobile 390, desktop 1280
}
```

### Schema package requirements

- zod schemas and inferred TypeScript types for all three files, exported from the package root.
- **Referential integrity** via `superRefine`: relationship `from`/`to` must reference existing entity ids; every transition `from` must resolve to an existing screen → state → cta; every transition `to` must resolve to an existing screen and, if given, an existing state on that screen; every `layout` key must reference an existing entity/screen; every screen has ≥ 1 state; ids are unique within their collection.
- `defaultErd()`, `defaultFlows()`, `defaultConfig(name)` factories that return valid, empty documents. These are what "initialise `.design/`" writes.
- A `migrate(kind, data)` entry point that dispatches on `schemaVersion`. At v1 it's a no-op pass-through, but the mechanism and its test must exist so phase 2+ has a slot.
- `parseErd`, `parseFlows`, `parseConfig` helpers that run migrate → validate and return either the typed document or a structured error with zod issue paths (so the UI can say *where* a hand-edited file is wrong, not just that it is).
- A stable serialiser (`stringify*`) with 2-space indentation and deterministic key order, so re-saving an untouched file produces no diff.
- Ids are opaque non-empty strings. The tool generates short random ids (nanoid or similar); the schema does not care about format.

**Tests (Vitest):** valid fixtures parse; each referential-integrity rule fails with the expected issue path; `states` empty fails; defaults are valid; `migrate` is a no-op at v1; parse → stringify → parse is stable; unknown `schemaVersion` is rejected with a clear message.

## Server (`apps/server`)

Small Hono server on Node, bound to `127.0.0.1` only. It is the only thing that touches disk.

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/projects/open` | Body `{ path }`. Resolves and validates an absolute directory path. Returns `{ path, name, initialised: boolean }` where `initialised` is whether `.design/` exists with all three files. Adds to recents on success. |
| `POST` | `/api/projects/init` | Body `{ path, name? }`. Creates `.design/` with the three default files. Refuses if `.design/` already exists. |
| `GET` | `/api/projects/recent` | Returns recents, most recent first. |
| `DELETE` | `/api/projects/recent` | Body `{ path }`. Removes one entry. |
| `GET` | `/api/design/:file` | Query `path=<project>`. `:file` ∈ `erd` \| `flows` \| `config`. Reads, migrates, validates and returns the typed document, or `422` with the structured validation error. |
| `PUT` | `/api/design/:file` | Query `path=<project>`, body = document. Validates with the schema package, then writes atomically (temp file + rename). `422` on invalid input. |

Rules:

- Writes are only ever permitted inside `<project>/.design/`. Reject anything else, including path traversal.
- Recents live in the user's config directory (e.g. `~/.modelwright/recents.json`), never in this repo and never in a project. Dedupe by path, cap at 20.
- Validation errors are returned as structured JSON (`{ file, issues: [{ path, message }] }`), not as 500s.

**Tests (Vitest, against a temp directory):** open on a missing path → 404; open on a directory without `.design/` → `initialised: false`; init creates three files that pass the schema; init on an already-initialised project → 409; read returns the parsed document; read of a hand-corrupted file → 422 with issue paths; write rejects an invalid document and leaves the file untouched; write is atomic (no partial file on failure); write outside `.design/` is rejected; recents add, dedupe, reorder and remove.

## Web shell (`apps/web`)

Vite + React + TypeScript. No canvas, no React Flow.

### Platform boundary

```ts
// apps/web/src/platform/ProjectClient.ts
interface ProjectClient {
  openProject(path: string): Promise<ProjectSummary>
  initProject(path: string, name?: string): Promise<ProjectSummary>
  listRecent(): Promise<ProjectSummary[]>
  removeRecent(path: string): Promise<void>
  readDesign<K extends 'erd' | 'flows' | 'config'>(path: string, file: K): Promise<DesignDoc<K>>
  writeDesign<K extends 'erd' | 'flows' | 'config'>(path: string, file: K, doc: DesignDoc<K>): Promise<void>
}
```

One implementation in phase 1: `httpClient`, talking to `/api`. Provide it through React context. **No component may call `fetch` or reference a server URL directly** — this boundary is what makes the Electron wrap a swap instead of a rewrite.

### Screens

1. **Project picker** (shown when no project is open). Recents list (name, path, remove) plus a text field for pasting an absolute path and an Open button. Opening a folder without `.design/` offers "Initialise modelwright in this folder" with a name field. Surface server errors inline. Accepted v1 trade-off: no native folder dialog.
2. **Shell** (shown when a project is open). Header with project name, project path, a three-way segmented toggle — **ERD · Flows · UI** — a Reload control, and a Close project action. The selected view persists across reloads (`localStorage` is fine for this).
3. **Three views.** Each is a placeholder that proves load works without being a canvas:
   - **ERD:** entity count, relationship count, and a plain list of entity names with their attribute names.
   - **Flows:** screen count, transition count, and a plain list of screens with their state names and CTA labels.
   - **UI:** the preview URL from `config.json` (or an empty state saying none is set), plus the device presets. Rendering an iframe is **not** required in phase 1 — that's phase 4.
   Each view has an honest empty state when its document has no content.
4. **Validation surface.** If a file fails to parse (because I hand-edited it badly), the view shows the issue paths and messages rather than crashing or showing stale data.
5. **One real write.** The project name (from `config.json`) is editable inline in the header and saves through `writeDesign`. This proves the write path on an existing file; "Initialise" proves it on new files.

Reload: a visible Reload control re-reads all three files. Nice-to-have: re-read on window focus. Not required: a file watcher.

## Example `.design/` fixture

Use this (or something equally small) as a test fixture and for the done-means check. A tiny notes app:

```jsonc
// erd.json
{
  "schemaVersion": 1,
  "entities": [
    { "id": "user", "name": "User", "attributes": [
      { "id": "user-email", "name": "email" },
      { "id": "user-name", "name": "display name" }
    ]},
    { "id": "note", "name": "Note", "attributes": [
      { "id": "note-title", "name": "title" },
      { "id": "note-body", "name": "body" },
      { "id": "note-updated", "name": "updated at", "note": "set on every save" }
    ]}
  ],
  "relationships": [
    { "id": "user-notes", "from": "user", "to": "note", "fromCard": "one", "toCard": "zero-many", "label": "owns" }
  ],
  "layout": { "user": { "x": 0, "y": 0 }, "note": { "x": 320, "y": 0 } }
}
```

```jsonc
// flows.json
{
  "schemaVersion": 1,
  "screens": [
    { "id": "login", "name": "Login", "states": [
      { "id": "login-default", "name": "Default", "sees": ["email field", "password field"], "ctas": [{ "id": "login-submit", "label": "Sign in" }] },
      { "id": "login-error", "name": "Error", "sees": ["email field", "password field", "error message"], "ctas": [{ "id": "login-retry", "label": "Try again" }] }
    ]},
    { "id": "notes", "name": "Notes", "entities": ["note"], "states": [
      { "id": "notes-list", "name": "List", "sees": ["note titles", "updated dates"], "ctas": [{ "id": "notes-new", "label": "New note" }, { "id": "notes-open", "label": "Open note" }] },
      { "id": "notes-empty", "name": "Empty", "sees": ["empty message"], "ctas": [{ "id": "notes-empty-new", "label": "Create your first note" }] }
    ]},
    { "id": "editor", "name": "Note editor", "entities": ["note"], "states": [
      { "id": "editor-default", "name": "Default", "sees": ["title field", "body field"], "ctas": [{ "id": "editor-save", "label": "Save" }, { "id": "editor-back", "label": "Back" }] }
    ]}
  ],
  "transitions": [
    { "id": "t1", "from": { "screenId": "login", "stateId": "login-default", "ctaId": "login-submit" }, "to": { "screenId": "notes" } },
    { "id": "t2", "from": { "screenId": "notes", "stateId": "notes-list", "ctaId": "notes-new" }, "to": { "screenId": "editor" } },
    { "id": "t3", "from": { "screenId": "notes", "stateId": "notes-empty", "ctaId": "notes-empty-new" }, "to": { "screenId": "editor" } },
    { "id": "t4", "from": { "screenId": "editor", "stateId": "editor-default", "ctaId": "editor-back" }, "to": { "screenId": "notes", "stateId": "notes-list" } }
  ],
  "layout": { "login": { "x": 0, "y": 0 }, "notes": { "x": 360, "y": 0 }, "editor": { "x": 720, "y": 0 } }
}
```

```jsonc
// config.json
{
  "schemaVersion": 1,
  "name": "Notes",
  "preview": { "url": "http://localhost:5173" }
}
```

## Out of scope for phase 1

Do not build any of these, even if they seem small:

- React Flow, nodes, edges, any canvas
- Entity or screen editing beyond the project name
- Iframe preview, device frame
- Spawning dev servers
- File watching
- Cross-file validation (screen `entities` against `erd.json`)
- Electron, IPC client, native dialogs
- Undo/redo, shortcuts, dark mode, Mermaid export
- The `/build-from-design` skill

## Milestones (one commit each)

1. **Scaffold** — pnpm workspace, three packages wired, lint/format/typecheck/test scripts all green on empty packages, `pnpm dev` starts web and server together with the `/api` proxy working.
2. **Schema** — `@modelwright/schema` complete with all tests passing. Stop here and show me the types before continuing; this is the review gate.
3. **Server** — all endpoints with tests passing against a temp directory.
4. **Web shell** — picker, shell, toggle, three placeholder views, `ProjectClient` + `httpClient`, validation surface, inline project-name edit.
5. **Round trip verified** — the done-means checklist below walked through by hand, with results reported.

## Done means

All of the following, demonstrated, not asserted:

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass at the repo root.
- [ ] `pnpm dev` starts both apps; the web app loads with the project picker.
- [ ] Pasting the absolute path of an empty folder → "not initialised" → Initialise with a name → `.design/` appears on disk with three files that pass the schema.
- [ ] Pasting the path of a folder containing the example fixture → three views show the right counts and names.
- [ ] The project appears in recents; reloading the browser and choosing it from recents reopens it on the last-selected view.
- [ ] Hand-edit `erd.json` in a text editor — add an entity — press Reload → the ERD view shows it.
- [ ] Hand-edit `erd.json` to break it (a relationship pointing at a missing entity) → Reload → the ERD view shows the issue path and message, nothing crashes, the other two views still work.
- [ ] Edit the project name in the header → `config.json` on disk changes, and nothing else in the file changes (deterministic serialisation).
- [ ] No component in `apps/web` imports `fetch`, Node `fs`, or a server URL directly — everything goes through `ProjectClient`.

When all boxes are ticked and committed, phase 1 is complete. Phase 2 (ERD canvas) starts in a new session.
