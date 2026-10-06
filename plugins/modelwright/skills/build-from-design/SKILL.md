---
name: build-from-design
description: Build this repo's app from its modelwright design in .design/ (erd.json, flows.json, config.json). The first run builds the app; later runs apply only what changed in the design since the last recorded build.
argument-hint: '[notes for this build]'
disable-model-invocation: true
allowed-tools: Bash(modelwright-design *)
---

# Build from design

This repo's app is designed in modelwright. The design lives in `.design/`:

- `erd.json`: entities, their attributes, and the relationships between them. It's a conceptual model, with no types or keys.
- `flows.json`: screens, their states, what each state shows ("information") and offers ("actions", called CTAs in the JSON), and the transitions between them.
- `config.json`: the project name and the preview (the dev server URL that modelwright shows in its UI view).
- `spec.md`: all of the above in Markdown. It's generated, so never edit it.
- `build.json`: the design as it was last built, and where each part of it lives in code. Only `modelwright-design record-build` writes it.

Your job is to build the app from the design, or bring it up to date with the design. The design is the source of truth, and it belongs to the user.

`modelwright-design` is a CLI that ships with this plugin. It's on your `PATH`. Use it for every step it covers, and never edit `.design/` JSON by hand. If it isn't found, stop and say the modelwright plugin isn't enabled in this session.

If the user passed notes with the command, follow them for this run: $ARGUMENTS

Work through the steps in order. Steps 4 and 6 wait for the user.

## 1. Preconditions

1. Run `modelwright-design validate`. If it fails, stop. Show the problems exactly as printed, and tell the user to fix them in modelwright. Don't try to fix the design yourself.
2. Run `modelwright-design spec` so `.design/spec.md` is current.
3. Read `.design/spec.md` for the overview. Then read `erd.json`, `flows.json` and `config.json`, which are the source of truth. Where they disagree with `spec.md`, the JSON wins.

## 2. Mode

Run `modelwright-design status`:

- **"No build yet"**: this is a **first build**. Go on to step 3.
- **"Up to date with the build of …"**: say so and stop.
- **"N changes since the build of …"**: this is an **update**. Run `modelwright-design diff` for the change list, and `modelwright-design diff --json` for the ids each change concerns. Skip step 3.

## 3. First build only: the stack

- If the repo already has app code, or its `CLAUDE.md` names a stack, use that.
- Otherwise ask the user which stack to use. Offer one sensible default for this design, with a sentence on why. Prefer a typed language, a data layer with migrations, and a dev server with hot reload.
- The app runs inside modelwright's preview iframe:
  - Its dev server must allow being framed by `http://localhost:4300` and `http://127.0.0.1:4300`, so it must send no `X-Frame-Options` header and no `frame-ancestors` that excludes them. Most dev servers allow framing by default.
  - It must not use ports 4300 or 4301, which are modelwright's own.

Once the stack is settled, record in the project's `CLAUDE.md` (create it if needed):

- the stack, and the build, test, lint and dev commands
- that the app is designed in modelwright: `.design/spec.md` describes it, `.design/*.json` is the source of truth, and design changes are made in modelwright, then applied with `/modelwright:build-from-design`
- the dev-only `?state=<stateId>` convention (see step 5)

Then scaffold the app, without touching `.design/`. The plan in step 4 covers everything after the scaffold.

## 4. Plan before code

Present a plan and **wait for the user's approval before writing any app code.**

- **First build:** map every design element to where it will live in code:
  - each entity: its model, fields and storage
  - each relationship: how it's stored
  - each screen: its route
  - each state: its component, and how it's reached
  - each action: what it does
  - each transition: how it navigates
- **Update:** map every change from `modelwright-design diff` to what will change in code, by file. Use the build map (step 6) to find that code.

Then list, separately:

- **Assumptions.** The ERD is conceptual, so attribute types, keys, optionality, uniqueness, defaults and storage are inferred from names and notes. List every inference for the user to confirm or correct, e.g. "`Note.updated at` → timestamp, required, set on every save (from its note)". Also list which screen is the entry route, and anything else the design doesn't say.
- **Removals.** List every piece of code an update would delete or drop: routes, components, fields, tables, columns. Removals are destructive. Remove only what the user approves.
- **Gaps.** Anything the design leaves ambiguous, contradictory or missing that the build needs. Ask about it here rather than guessing silently.

## 5. Mapping rules

- **Entities → the data model.** One model per entity, with the entity's name. **Attributes → fields** with inferred types. Give each model an id key unless the design implies another.
- **Relationships → keys or references**, read by cardinality. A relationship reads "Each <from> <label> <toCard> <to>. Each <to> belongs to <fromCard> <from>." (`spec.md` spells each one out.)
  - One end many, the other `one` or `zero-one`: a reference on the many side. It's required for `one` and optional for `zero-one`.
  - Both ends many (`many` or `zero-many`): a join model.
  - Both ends `one` or `zero-one`: a unique reference on one side. Pick the side that reads naturally and list the choice as an assumption.
  - `many` means one or more, and `zero-many` zero or more. Where the minimum can't be enforced in storage, enforce it where the data is created, or list it as an assumption.
- **Screens → routes or pages**, one each. Name routes after the screens.
- **States → that route's UI states, every one reachable in the running app.**
  - The first state is the default: what the route shows normally.
  - Use real conditions where practical: no data → an empty state, a pending request → a loading state, a failed request → an error state.
  - **In development builds, every state also answers to `?state=<stateId>`.** For example, `/notes?state=notes-empty` forces that state with plausible placeholder data, whatever the real condition. Use the state's id from `flows.json`, exactly. The override must do nothing in production builds. It lets the user see every state in modelwright's UI preview by editing the URL.
- **Information items → content the state shows,** in the order listed.
- **Actions (CTAs) → buttons or links,** with the label exactly as designed, in the order listed.
- **Transitions → navigation or handlers.**
  - A transition with no `stateId` goes to the target screen's default state. A transition with a `stateId` goes to that state.
  - A label names a condition. "success" and "failure" mean the action's outcome decides which transition is taken, so implement them as those conditions.
  - Several transitions from one action are branches; make each reachable.
- **Dead-end actions** (no transition) are rendered disabled, with a `TODO` comment that names the action and its id. List each one in the report.
- **A screen's `entities`** are the data its route reads or writes.
- **Styling is plain, consistent and accessible:** semantic HTML, readable type, visible focus, labelled inputs and enough contrast. Don't design it. Hi-fi visual design is a separate step, outside this skill.

## 6. Updates touch only what changed

- `.design/build.json` has a `map` from design ids to code:
  - `entities` and `screens`: id → paths
  - `states`: screen id → state id → paths
  - A path is a file, or `file#symbol`, relative to the repo root.
- For each change, find its code through the map. If a mapped path no longer exists, search for the element by its name before concluding anything.
- **A rename is a rename in code:**
  - for an entity or attribute: the model, field, column and identifiers, with a rename migration rather than a drop and an add
  - for a screen or state: the route, component and labels
- **Never regenerate untouched code.** Read each file before changing it, and keep anything changed by hand since the last build. Edit; don't rewrite.
- **Removals happen only once approved in step 4.**
- **Data-model changes that need a migration get one,** if the stack has migrations.

## 7. Verify

1. Run the project's own typecheck, lint and tests, and fix what fails.
2. Start the dev server in the background.
3. With a browser tool (the built-in browser or Claude in Chrome), check:
   - every screen in the design renders, and every state renders, through its real condition or `?state=<stateId>`
   - every transition navigates where the design says, and every dead-end action is disabled
   - for an update, at least everything the diff touched
4. Report anything you couldn't verify, and why. If no browser tool is available, check that each route responds over HTTP, and report the states and transitions as unverified.

## 8. Record the build

Only after verification passes. If the build failed or was abandoned, leave `build.json` as it is: don't record.

1. Point modelwright's UI view at the running app:

   ```
   modelwright-design set-preview --url <dev server URL> --dev-command "<dev command>"
   ```

2. Write a map file outside the repo, e.g. `"$(mktemp -d)/map.json"`, listing where each element you built or changed lives:

   ```json
   {
     "entities": { "<entityId>": ["src/db/schema.ts#notes"] },
     "screens": { "<screenId>": ["src/routes/notes.tsx"] },
     "states": { "<screenId>": { "<stateId>": ["src/routes/notes.tsx#EmptyState"] } }
   }
   ```

   - Use the ids from the design, not the names.
   - On an update, list only what you created, moved or renamed. Entries you leave out keep their previous paths, and ids no longer in the design are dropped.

3. Run `modelwright-design record-build --map <file>`. Then run `modelwright-design status`, which should now say "Up to date".

## 9. Never edit the design

Don't change `erd.json` or `flows.json`, and don't change `config.json` except through `modelwright-design set-preview`. If the design is ambiguous, contradictory or missing something the build needs, ask the user, or list it as a gap in the report. Never "fix" the design yourself. The user changes it in modelwright.

## 10. Report

End with:

- **Built or changed:** what, by screen and entity, with the preview URL. Include the `?state=` URLs for states that have no natural trigger.
- **Assumptions:** the ones the user confirmed, and any made since.
- **Gaps in the design:** anything ambiguous, contradictory or missing.
- **TODOs:** every dead-end action, and anything left unfinished.
- **Not verified:** anything step 7 couldn't check.

Don't commit unless the user asks. Remind them to commit `.design/build.json` with the code, since it records what the code was built from.
