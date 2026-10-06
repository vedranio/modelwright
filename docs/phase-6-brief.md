# modelwright — Phase 6 brief: Pipeline

Read `CLAUDE.md` and `docs/decisions.md` first. They are the standing context. Everything decided in phases 1–5 still holds, in particular:

- the two-repo rule: this repo never contains project code
- modelwright writes only inside `.design/`
- the schema package is the contract
- the generated `.design/spec.md` and its wording, settled at the phase 5 gate (including "Information" and "Actions" as the labels for a state's two lists)

---

## What you are building

Phases 1–5 built the design side. This phase closes the loop: Claude Code builds and updates an app *from* a modelwright design, and modelwright shows what has changed since the last build.

Four pieces:

1. **A Claude Code plugin, `modelwright`,** published from this repo as a marketplace. I install it once at user scope and it's available in every project repo, so modelwright never has to write a skill into a project. It contains:
   - **the `build-from-design` skill** (`/modelwright:build-from-design`): it builds an app from `.design/` on the first run, and on later runs applies only what changed in the design since the last build
   - **a bundled command-line tool, `modelwright-design`,** in the plugin's `bin/` (Claude Code puts that on `PATH` while the plugin is enabled). It gives the skill deterministic operations — validate, regenerate the spec, diff, record a build — instead of having it hand-edit JSON.
2. **A semantic design diff:** a pure function that compares two designs by id and describes the changes in plain language. Because ids are stable, a rename is reported as a rename, not a delete plus an add.
3. **A build record, `.design/build.json`,** written by the CLI when a build succeeds. It holds a snapshot of the design that was built and a map from design ids to the code that implements them.
4. **"Changes since last build" in modelwright:** a header indicator that diffs the current design against the build record's snapshot and lists what the next build will apply.

The first real project is built *with* the plugin, in its own repo, in a separate session after this phase. Here we prove the loop end to end on a throwaway project.

## How to work

1. Start in plan mode. Before writing the plan, interview me on anything in this brief that is ambiguous or that you'd decide differently — in particular the decisions listed under "Decisions this brief makes". Then present the plan and wait for approval.
2. Read the current Claude Code documentation for plugins, plugin marketplaces, skills and plugin executables before planning. Paths, manifest fields and commands in this brief are from the docs at the time of writing. Where the docs differ, the docs win; tell me.
3. Work milestone by milestone (listed at the end). Commit at each one and push the branch.
4. Respect the two review gates: after milestone 2 (the `SKILL.md` text) and after milestone 4 (the dry run, which I take part in). Stop there and wait for me.
5. Vitest is required on the diff, the build-record schema, the CLI and the server changes (see "Tests").
6. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before declaring any milestone done and report the results. Also run `claude plugin validate` on the plugin from milestone 2 onwards.
7. Throwaway projects for the dry run live outside this repo (e.g. `/tmp/notes-dryrun`). Nothing built from a design is ever committed here.
8. Once the interview has settled the decisions below, log them in `docs/decisions.md`, plus any others you make along the way.

## Scope

### 1. Semantic design diff — `diffDesign(before, after)`

A pure function in `packages/spec`, beside the spec generator, that compares two `{ config, erd, flows }` designs by id and returns a structured list of changes, plus a renderer that turns the list into plain-language Markdown.

- **ERD:**
  - entity added, removed or renamed; description changed
  - attribute added, removed, renamed, note changed or reordered
  - relationship added or removed, cardinality changed (described with phase 5's sentence wording, e.g. "Each User now owns one or more Notes (was zero or more)"), label changed, or reversed
- **Flows:**
  - screen added, removed or renamed; notes changed; `entities` cross-reference changed
  - state added, removed, renamed, reordered, or the default changed
  - information item added, removed or changed; CTA added, removed, renamed or reordered
  - transition added or removed, retargeted (screen or state), or label changed
  - CTAs that became dead ends, or stopped being dead ends
- **Config:** project renamed; preview URL changed.
- **Layout-only changes are not changes.** Moving a node never appears in the diff, because a build doesn't care where cards sit.
- **The output is deterministic,** grouped (Data model / Screens and flows / Config), and each item carries the ids it concerns, so the skill can look them up in the build map.

### 2. Build record — `.design/build.json`

A new schema in `packages/schema`. It's a new file alongside the three design files, so the existing contracts don't change and nothing gets a `schemaVersion` bump.

```ts
{
  schemaVersion: 1,
  builtAt: string,                   // ISO timestamp
  snapshot: { config, erd, flows },  // the design as built, each validated by its own schema
  map?: {                            // where each design element lives in code; written by the skill
    entities?: { [entityId]: string[] },   // file paths or file#symbol references
    screens?:  { [screenId]: string[] },
    states?:   { [stateId]: string[] }
  }
}
```

- Validated like the other files, with strict objects and the canonical serialisation conventions from phase 1.
- **modelwright itself never writes it.** The server reads it (section 5). The CLI writes it, and only when the skill records a successful build.
- **The snapshot is a copy, not a git reference,** so the diff works on uncommitted designs and in repos with no git history yet.

### 3. The CLI — `modelwright-design`

A new workspace package, `packages/cli`, built into a single self-contained Node script that ships in the plugin's `bin/`. It runs anywhere Node ≥ 24 is installed, with no install step in the project. Every command takes an optional project directory (default: the current directory), exits non-zero on failure, and prints plain text by default or JSON with `--json`.

| Command | Does |
|---|---|
| `validate` | Parses `config.json`, `erd.json` and `flows.json` (and `build.json` if present) with the schema package. Prints every issue with its path, like the validation surface. |
| `spec` | Regenerates `.design/spec.md` with `packages/spec`, exactly as the server does, so the spec is current even when modelwright isn't running. Writes nothing if any file is invalid. |
| `diff` | Diffs the current design against `build.json`'s snapshot. With no `build.json`, says this is a first build. With `--from <file>`, diffs against a design snapshot file instead. |
| `status` | One line: "No build yet", "Up to date with the build of <date>", or "N changes since the build of <date>". |
| `record-build [--map <file>]` | Writes `build.json`: the current design as the snapshot, the current time, and the map from a JSON file the skill prepares, merged over the previous map with entries for ids that no longer exist dropped. Validates everything first. |
| `set-preview --url <url> [--dev-command <cmd>]` | Updates `config.json`'s `preview` through the same pure ops and URL rules as the UI view (phase 4), with canonical serialisation. Then regenerates `spec.md`. |

- **The CLI writes only inside `.design/`,** and only `build.json`, `spec.md` and (via `set-preview`) `config.json`. Writes are atomic, as on the server. It never touches `erd.json` or `flows.json`: the design is mine, not the build's.
- **The bundled script is committed** inside the plugin, because a marketplace installs from git. A `pnpm build:plugin` script produces it, and a test fails if the committed bundle doesn't match a fresh build, so it can't drift from the packages.
- **modelwright's server and the CLI share the spec-writing code** rather than duplicating it.

### 4. The plugin and the `build-from-design` skill

**Layout** (confirm against the docs):

```
.claude-plugin/marketplace.json        # this repo as a marketplace listing one plugin
plugins/modelwright/
  .claude-plugin/plugin.json           # name "modelwright", description, version
  skills/build-from-design/SKILL.md    # the skill (plus supporting files if useful)
  bin/modelwright-design               # the bundled CLI
```

I install it once with `/plugin marketplace add vedranio/modelwright` and `/plugin install modelwright@<marketplace name>`, and run it in a project repo as `/modelwright:build-from-design`. `docs/using-modelwright.md` (section 6) records the exact commands.

**What the skill does.** You write `SKILL.md`; this is what it must cover. Set `disable-model-invocation: true` so it only runs when I invoke it.

1. **Preconditions.**
   - Run `modelwright-design validate`. If anything is invalid, stop with the issues.
   - Run `modelwright-design spec` so `spec.md` is current.
   - Read `.design/spec.md` for the narrative and the three JSON files as the source of truth. Where they disagree, the JSON wins and `spec.md` is stale.
2. **Mode.** `modelwright-design status`:
   - **no build record** → a first build
   - **up to date** → say so and stop
   - **otherwise** → an update, with `modelwright-design diff` as the change list
3. **First build only — the stack.** If the repo already has app code, or its `CLAUDE.md` names a stack, use it. Otherwise, interview me for the stack, offering one sensible default with a sentence on why. Record the choice, the build, test and dev commands, and a pointer to `.design/spec.md` in the project's `CLAUDE.md`, creating it if needed. Scaffold the app.
4. **Plan before code.** Present a mapping plan and wait for my approval:
   - for a first build, every design element → where it will live in code
   - for an update, every change → what will change in code

   List **assumptions** separately. The ERD is conceptual: attribute types, keys, optionality and storage are inferred from names and notes, and every inference is listed for me to confirm or correct.
5. **Mapping rules:**
   - **Entities** → the data model. Attributes → fields with inferred types.
   - **Relationships** → keys or references by cardinality. Both ends many → a join model. `one` / `zero-one` → required / optional references.
   - **Screens** → routes or pages.
   - **States** → the UI states of that route, each reachable in the running app. Use real conditions (empty data, loading, a failed request) where practical. Otherwise use a dev-only override, so every state can be seen in modelwright's UI preview; say which convention is used.
   - **Information items** → content the screen shows. **Actions (CTAs)** → buttons or links.
   - **Transitions** → navigation or handlers, with labels such as "success" and "failure" implemented as the conditions they name. **Dead-end CTAs** → rendered and disabled, with a TODO, and reported.
   - A screen's **`entities`** cross-reference → the data that route reads or writes.
   - **Styling** is plain, consistent and accessible, not designed. Hi-fi visual design is a separate step (Claude Design), not this skill's job.
6. **Updates touch only what changed.**
   - Use the build map to find the code for each changed id. A rename is a rename in code; never regenerate untouched code; and respect hand edits made since the last build.
   - Removals are destructive, so list them in the plan and remove them only once I've approved.
   - Data-model changes that need a migration get one, if the stack has migrations.
7. **Verify.**
   - Typecheck, lint and test with the project's own commands.
   - Start the dev server and check, with the browser tool, that every screen and every state in the design renders and that every transition navigates where the design says.
   - Report anything that couldn't be verified.
8. **Record.**
   - Set the preview with `modelwright-design set-preview` (the dev server URL and command), so modelwright's UI view works straight away.
   - Write the map file and run `modelwright-design record-build --map <file>`. Only after verification passes. A failed or abandoned build leaves `build.json` as it was.
9. **Never edit the design.** The skill doesn't change `erd.json` or `flows.json`. If the design is ambiguous, contradictory or missing something the build needs, it asks me, or lists the gap in the report, rather than "fixing" the design.
10. **Report:** what was built or changed, the assumptions made, the gaps found in the design, and anything left as a TODO.

### 5. "Changes since last build" in modelwright

- **Server:** a read-only `GET /api/design/build?path=` behind the existing guard returns the parsed `build.json`, or none. The phase 5 watcher also reports `build.json` changes, so modelwright notices when a build finishes. The server never writes `build.json`; its write rule is unchanged.
- **`ProjectClient.readBuildRecord(path)`,** and `watchDesign` events for `kind: 'build'`.
- **Header indicator,** built from tokens and placed near the save status or the project name; your call:
  - **no build record** → "Not built yet"
  - **up to date** → "Built <relative time>"
  - **otherwise** → "N changes since last build"
  - **an invalid `build.json`** → a quiet warning, never a crash
- **Popover** on click:
  - the rendered diff (from `diffDesign` between the snapshot and the current working copies, including unsaved edits)
  - a line saying to run `/modelwright:build-from-design` in the project repo, with a copy button for that command

### 6. Documentation — `docs/using-modelwright.md`

A short guide, written for me in six months:

- installing and updating the plugin
- starting modelwright (`pnpm dev`) and opening a project
- the loop: design in modelwright → run the skill in the project repo → review the plan → check the preview → iterate
- what `build.json` is, and that it should be committed with the project
- the CLI commands

Link it from the root `README.md`, creating that if it doesn't exist.

## Decisions this brief makes

Challenge any of these in the interview. Once settled, log them in `docs/decisions.md`.

- **A user-scope plugin from this repo's marketplace,** not a skill copied into each project. modelwright still never writes outside `.design/`.
- **The skill uses a bundled CLI** for every deterministic operation, and never hand-edits JSON.
- **The bundled CLI is committed,** with a test that keeps it in step with the packages.
- **`build.json` holds a full snapshot,** not a git reference, plus an id → code map. It's written only by the CLI, after a verified build.
- **Diffs ignore layout.**
- **The design is read-only to the build.** Gaps are reported, never patched by the skill.
- **The plan comes first and assumptions are explicit,** with removals approved before they happen.
- **Every state must be reachable** in the running app, by real conditions or a dev-only override, so the UI preview can show it.
- **Styling stays plain.** Hi-fi is a later, separate step.
- **The build map lives in `build.json` only,** with no marker comments in generated code. Challenge this one if you think markers would make updates more reliable.

## Tests (Vitest)

- **`diffDesign`:**
  - every change type in section 1
  - renames detected by id
  - layout-only changes producing an empty diff
  - deterministic ordering
  - golden Markdown for the notes fixture against an edited copy that touches every category
- **The `BuildRecord` schema:** valid records parse; a snapshot with an invalid design fails, with paths into the snapshot; unknown keys are rejected; serialisation is canonical.
- **The CLI**, against temp directories:
  - each command's output and exit code
  - `record-build` merging maps and dropping dead ids
  - `set-preview` applying the URL rules
  - `spec` matching the server's output byte for byte
  - no writes to `erd.json` or `flows.json` ever
  - no write at all when validation fails
- **The bundle check:** the committed `bin/modelwright-design` equals a fresh build.
- **The server:** `GET /api/design/build` (none, valid, invalid) behind the guard; the watcher reporting `build.json` changes; the server's write rule unchanged.
- **The indicator:** status text for each case, as a pure function.

## Out of scope for phase 6

- Running the skill or Claude Code from inside modelwright (a "Build" button). modelwright stays passive: it shows what changed and the command to run.
- Hi-fi design, design tokens or theming for built apps
- A physical ERD (types, keys, nullability in the schema). The skill infers these and lists them as assumptions, and the schema stays unchanged.
- Reverse sync from code back into the design
- Publishing the plugin to Anthropic's community marketplace
- Electron
- The first real project's build. That happens in its own repo after this phase.

## Milestones (one commit each, pushed)

0. **Diff and build record.** `diffDesign` and its Markdown renderer in `packages/spec`, and the `BuildRecord` schema in `packages/schema`, with tests.
1. **CLI.** `packages/cli` with every command, `pnpm build:plugin`, and the bundle check, with tests.
2. **Plugin and skill — review gate.** The marketplace, plugin manifest, bundled `bin/` and `SKILL.md`, passing `claude plugin validate`. **Stop here.** Show me the full `SKILL.md` and wait for my go-ahead. Its wording decides how every future build behaves, so expect edits.
3. **Changes since last build.** The server endpoint and watcher event, `readBuildRecord`, the header indicator and the popover.
4. **Dry run — review gate, with me.**
   - Copy the notes fixture's three design files into a fresh throwaway repo outside this one (e.g. `/tmp/notes-dryrun`, with `git init`).
   - Give me the exact commands to install the plugin from the `phase-6` branch, or with `--plugin-dir`, and to run the skill there in a separate Claude Code session.
   - I run the first build, and you help me review the result: the plan, the assumptions, every screen and state in modelwright's UI preview, and `build.json`.
   - Then I change the design in modelwright: rename an entity, add an attribute, add a screen with a transition to it, retarget a transition, and delete a CTA. The indicator should show those changes. I run the skill again for an update.

   Fix `SKILL.md`, the CLI or the diff from what we find, and log the findings. Wait for my go-ahead.
5. **Docs and verified.** `docs/using-modelwright.md` and the README link. Walk the "done means" checklist below, fix what it finds, and report the results.

## Done means

All of the following, demonstrated rather than asserted:

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass at the repo root, and `claude plugin validate` passes on the plugin.
- [ ] The plugin installs from this repo's marketplace at user scope, and `/modelwright:build-from-design` is available in an unrelated repo.
- [ ] `modelwright-design` is on `PATH` in that repo's Claude Code session, and `validate`, `spec`, `diff`, `status`, `record-build` and `set-preview` behave as specified.
- [ ] In the dry run, the first build produced a running app in which every screen and state of the notes design can be seen in modelwright's UI preview, and every transition navigates as designed.
- [ ] The first build's plan listed its type and key assumptions, and the skill waited for my approval before writing code.
- [ ] After the build, `.design/build.json` exists and validates, and modelwright's indicator says "Built <time>".
- [ ] After my design changes, the indicator shows them, renames as renames, and moving a card adds nothing.
- [ ] The update run changed only the code for what changed, asked before removing the deleted CTA's code, and left hand edits elsewhere intact.
- [ ] Neither run modified `erd.json` or `flows.json`.
- [ ] Adding a stray `"type"` key to an attribute in `erd.json` by hand makes `validate` fail with its path, and the skill stops at preconditions.
- [ ] `docs/using-modelwright.md` lets me redo the whole loop without this brief.
- [ ] Everything from phases 1–5 still works. Spot-check their done-means.

When every box is ticked and committed, phase 6 is complete. The next step is the first real project, in its own repo.
