# Using modelwright

How to design an app in modelwright and have Claude Code build it, start to finish. Two tools take part:

- **modelwright,** a Mac app, where you design: the data model (ERD), the screens and flows, and a live preview of the app.
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

## 2. Install the modelwright app

modelwright is a macOS app for Apple silicon, built from this repo. It isn't published anywhere, so you build it yourself, once per update. It needs Node 24 or later and pnpm, only while building.

In this repo:

```bash
pnpm install
```

```bash
pnpm package
```

That makes `apps/desktop/dist/modelwright-<version>-arm64.dmg`. Open it in Finder, drag **modelwright** onto **Applications**, and eject the disk image. Open modelwright from Applications or Launchpad, and keep it in the Dock if you like.

**The first launch.** The app is signed for this Mac only (ad-hoc), not notarised by Apple. A `.dmg` you built yourself usually opens straight away. If macOS says it can't verify the app, open System Settings ▸ Privacy & Security, click **Open Anyway** beside modelwright, and confirm. That's needed once per install.

### Updating

There's no auto-update. To update, quit modelwright, pull this repo, and build and install again:

```bash
git pull
```

```bash
pnpm install
```

```bash
pnpm package
```

Then drag the new **modelwright** onto **Applications** and choose **Replace**. Your recents, the demo and the window's place are kept: they live in `~/.modelwright`, not in the app.

### What it keeps where

- **Your designs:** in each project's `.design/` folder. That's the only place modelwright writes in a project, apart from creating a new project's folder.
- **modelwright's own state:** in `~/.modelwright`. That's the recent projects, the demo project, and the app's storage and window state (`~/.modelwright/desktop`).
- **macOS's defaults for the app:** `~/Library/Preferences/dev.modelwright.app.plist`, which every Mac app gets.

To remove modelwright, delete it from Applications, and `~/.modelwright` too if you want its state gone.

## 3. Using the app

The picker comes first:

- **Create a project:** give it a name, choose its location (**Choose…** opens a folder dialog, or type a path; `~` works), and optionally `git init`. modelwright makes the folder with an empty design inside.
- **Open an existing project…** (⌘O) opens a folder dialog. A folder without a design yet gets an empty `.design/` once you choose to initialise it. **or paste a path** still works.
- **Reopen a recent one,** or try the Todo demo.

The project you were in reopens when you start modelwright again. One window shows one project at a time.

**The menu bar** has every command, with its shortcut:

- **File:** New Project ⌘N, Open… ⌘O, Open Recent, Close Project ⌘W.
- **Edit:** Undo ⌘Z and Redo ⇧⌘Z (in a text field they undo your typing; elsewhere the last edit on the canvas), Cut, Copy, Paste, Select All, Duplicate ⌘D, Delete.
- **View:** ERD, Flows and UI (⌘1–3, or just 1–3), Reload Design ⌘R (reads the files from disk again), Reload Preview ⇧⌘R, zoom, Fit, Theme, full screen.
- **Help:** how modelwright works, and the keyboard shortcuts (or press `?`).

Cut, copy and paste work on text, not yet on cards.

**The Dock.** Right-click modelwright's Dock icon for your recent projects. Drop a project folder on the icon to open it.

**Saving.** Everything saves by itself. Closing a project, closing the window or quitting (⌘Q) saves anything still pending first, and asks only if that fails. Editing a design file in a text editor while modelwright is open updates the canvas. With unsaved edits, it asks which to keep.

**Theme.** System follows macOS's appearance as it changes; Light and Dark override it. Choose from View ▸ Theme or the header's theme button.

## 4. The loop

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

- **The UI tab** shows the running app; the build sets its preview URL. Start the app's dev server yourself (the "Nothing running" card shows its command), and the preview appears.
- **Mobile and Desktop:** Mobile previews the app as a phone would show it: a phone's viewport and pixel density, a mobile Safari user agent, and touch, so the app sees a phone. Desktop is a desktop browser. ⇧⌘R reloads the preview, and **Open in browser** opens it in your default browser.
- **Any dev server can be previewed,** including one that refuses to be framed (`X-Frame-Options`), because the app shows the preview as a page of its own. Keep apps off ports 4300 to 4302, which are modelwright's.
- **Every state is reachable** in development builds with `?state=<stateId>` on its route, e.g. `/tasks?state=tasks-empty`, using the state's id from `flows.json`. The build's report lists the URLs for states that have no natural trigger.
- **Desktop apps** you build (Electron and the like) can't run inside the preview, so it shows their renderer's browser dev server instead, with stubs where the app calls native APIs.

### Iterate

Change the design in modelwright. The header's build indicator counts the **changes since the last build**; click it to see them. Renames show as renames, and moving cards doesn't count. From that list you can also **Revert all**, which puts the design back as it was at the last build, keeping where cards sit.

Run `/modelwright:build-from-design` again, and it applies only those changes: renames as renames (with a rename migration for data), removals after your approval, and code you've edited by hand left alone.

## 5. `build.json`

`.design/build.json` records the last build: a snapshot of the design that was built, and a map from each entity, screen and state to the code that implements it. modelwright diffs against the snapshot to show what's changed, and the next build uses the map to find the code to change.

- Only the CLI writes it, and only after a build passes verification.
- **Commit it with the code it describes,** and commit the rest of `.design/` too. The design versions alongside the app.

## 6. The CLI

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

## 7. The web build (for working on modelwright)

The same app also runs in a browser, served by a small local server. It's the harness for developing and testing modelwright, because Claude Code can drive a browser but not the desktop app's window. It shares `~/.modelwright` with the app, so both see the same recents and demo. In this repo:

```bash
pnpm dev
```

Then open http://127.0.0.1:4300. The UI is on 4300 and its server on 4301. What's different from the app:

- **No folder dialogs:** open a project by pasting its path.
- **No menu bar:** the browser keeps ⌘R, ⌘N, ⌘O, ⌘W and ⌘1–3 for itself, so those shortcuts and their hints aren't there. Plain 1–3 and the rest work.
- **The preview is an iframe** at the device's width, without a phone's user agent or touch. A dev server that sends `X-Frame-Options` or a `frame-ancestors` that excludes `http://localhost:4300` shows "refuses to be embedded" instead.
- **Saving needs the server.** If `pnpm dev` stops, edits wait and save once it's back.

To work on the desktop app itself, `pnpm dev:desktop` runs it from source with hot reload. Quit the installed app first, because the two share their storage and only one can run at a time.
