# Using modelwright

How to design an app in modelwright and have Claude Code build it, start to finish. Two tools take part:

- **modelwright,** in your browser, where you design: the data model (ERD), the screens and flows, and a live preview of the app.
- **Claude Code,** in the app's own repo, which builds the app from the design with the `modelwright` plugin.

They meet in the app repo's `.design/` folder. modelwright only ever writes there, and the app's code never lives in this repo.

## 1. Install the plugin (once)

The plugin gives Claude Code the `/modelwright:build-from-design` command and the `modelwright-design` CLI it uses. Install it at user scope, so it works in every repo:

```bash
claude plugin marketplace add vedranio/modelwright
```

```bash
claude plugin install modelwright@modelwright --scope user
```

In the desktop app, do the same from the Code tab's `/plugin` menu: add the marketplace `vedranio/modelwright`, then install **modelwright**.

- **To install from a branch** instead of `main`, add `vedranio/modelwright#<branch>`. A marketplace name can only be added once, so switching means `claude plugin marketplace remove modelwright` first.
- **To work on the plugin itself,** add this checkout as a folder marketplace (`claude plugin marketplace add ~/Code/modelwright`). It then loads in place, and `/reload-plugins` picks up edits without a commit.
- **The CLI needs Node 24 or later** on your `PATH`.

### Updating

Updates aren't automatic for marketplaces other than Anthropic's. The plugin has no version number, so every commit pushed to `main` is an update:

```bash
claude plugin marketplace update modelwright
```

```bash
claude plugin update modelwright@modelwright
```

Then start a new Claude Code session, or run `/reload-plugins`. To have it happen by itself, turn auto-update on for the marketplace in `/plugin`.

## 2. Start modelwright

In this repo:

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://127.0.0.1:4300. Ports 4300 (the UI) and 4301 (its server) are fixed, so keep apps you build off them.

The picker lets you:

- **create a project:** a new folder with an empty design, and optionally `git init`
- **open an existing project:** paste the absolute path of its folder. A folder without a design yet gets an empty `.design/` once you choose to initialise it
- **reopen a recent one,** or try the Todo demo

## 3. The loop

### Design

- **ERD:** the entities, their attributes, and how they relate. It's conceptual: no types or keys. Give an attribute a note when its type or rules aren't obvious from its name ("optional", "in bytes", "succeeded or failed"); the build reads names and notes to infer the rest.
- **Flows:** screens, their states, what each state shows (Information) and offers (Actions), and where each action leads. Draw a connection from an action to a screen or state, and drag its arrow end to reassign it. Mark each state's main action as primary, and use screen and state notes for requirements.
- **UI:** once the app runs, its preview. It's for checking, not designing.

Everything saves by itself, and `.design/spec.md` is regenerated from the design on every save.

### Build

Open Claude Code in the project's folder, in a session separate from modelwright's repo, and run:

```
/modelwright:build-from-design
```

You can add notes for this run after the command. The skill then:

1. **Checks the design.** If it has problems, it stops and shows them. Fix them in modelwright.
2. **Settles the stack** on a first build, asking you if the repo doesn't already have one, and records it in the project's `CLAUDE.md`.
3. **Presents a plan and waits for your approval.** Read it closely:
   - **Assumptions:** the types, keys and rules it inferred from the ERD. Correct anything wrong.
   - **Removals:** code an update would delete. Nothing is removed unless you approve it.
   - **Gaps:** what the design doesn't say. It asks the blocking ones one at a time, with a recommendation. Most gaps are best fixed in the design: change it in modelwright, then tell Claude Code it's changed.
4. **Builds, verifies** with the project's tests and a browser, **and records the build** in `.design/build.json`.

The skill never edits the design. If something's wrong in it, it asks you.

### Check

- **The UI tab** shows the running app; the build sets its preview URL. Switch between mobile and desktop widths.
- **Every state is reachable** in development builds with `?state=<stateId>` on its route, e.g. `/tasks?state=tasks-empty`, using the state's id from `flows.json`. The build's report lists the URLs for states that have no natural trigger.
- **Desktop apps** (Electron and the like) can't be framed, so the preview shows their renderer's browser dev server instead, with stubs where the app calls native APIs.

### Iterate

Change the design in modelwright. The header's build indicator counts the **changes since the last build**; click it to see them. Renames show as renames, and moving cards doesn't count. From that list you can also **Revert all**, which puts the design back as it was at the last build, keeping where cards sit.

Run `/modelwright:build-from-design` again, and it applies only those changes: renames as renames (with a rename migration for data), removals after your approval, and code you've edited by hand left alone.

## 4. `build.json`

`.design/build.json` records the last build: a snapshot of the design that was built, and a map from each entity, screen and state to the code that implements it. modelwright diffs against the snapshot to show what's changed, and the next build uses the map to find the code to change.

- Only the CLI writes it, and only after a build passes verification.
- **Commit it with the code it describes,** and commit the rest of `.design/` too. The design versions alongside the app.

## 5. The CLI

`modelwright-design` comes with the plugin. Claude Code puts it on the Bash tool's `PATH` in every session where the plugin is enabled; it isn't on your own shell's `PATH`. Each command works on `.design/` in the current folder, or in a folder passed as the first argument, and takes `--json`.

| Command | What it does |
| --- | --- |
| `validate` | Checks `config.json`, `erd.json`, `flows.json` and `build.json`, naming each problem's path. Exits 1 if any are invalid. |
| `spec` | Regenerates `.design/spec.md`. |
| `status` | One line: no build yet, up to date, or how many changes since the last build. |
| `diff [--from <file>]` | The changes since the last build, in plain language. `--json` adds the ids each change concerns. |
| `record-build [--map <file>]` | Records the current design as built, merging the map of where things live in code. |
| `set-preview --url <url> [--dev-command <cmd>]` | Sets the preview URL, and the command that starts the dev server, in `config.json`. |

No command ever writes `erd.json` or `flows.json`, and none writes anything while the design is invalid.

To run it yourself outside Claude Code, use the copy in this repo:

```bash
~/Code/modelwright/plugins/modelwright/bin/modelwright-design status
```
