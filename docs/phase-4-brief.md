# modelwright — Phase 4 brief: Preview

Read `CLAUDE.md` and `docs/decisions.md` first. They are the standing context. Everything decided in phases 1–3 still holds, in particular:

- the platform boundary: nothing in a component touches `fetch`, `fs` or a server URL
- the origin/host guard on the server
- the hint rule: a keyboard hint shows only for a shortcut that works
- every visual value comes from `tokens.css`
- the accepted v1 trade-off: the mobile preview changes viewport width only, with no user-agent override

---

## What you are building

The UI view becomes a live preview of the app being designed. Today it lists the preview URL and device presets as text. By the end of this phase it shows the project's running dev server inside a device frame. I can switch between the devices with a toggle and set the preview URL from the tool, and the view says clearly what's wrong when the preview can't be shown — nothing running there yet, or a server that refuses to be embedded.

This completes the three views. The ERD and Flows describe the app; the UI view shows what Claude Code built from them.

modelwright never starts the project's dev server. I start it myself, in the project repo, and the tool reads the URL from `config.json`. `preview.devCommand` is shown as a hint, never run.

## How to work

1. Start in plan mode. Before writing the plan, interview me on anything in this brief that is ambiguous or that you'd decide differently — in particular the decisions listed under "Decisions this brief makes". Then present the plan and wait for approval.
2. Check `design-refs/` before planning and tell me what you find. If a `phase 4 designs/` folder exists, match it for the preview toolbar, device frame and preview states. If not, build them from the existing tokens and components. The "No preview URL set" card in `phase 1 designs/05-shell-empty-states.png` is the starting point for the empty state. It'll all be judged at the milestone 3 review gate.
3. Work milestone by milestone (listed at the end). Commit at each one and push the branch.
4. Respect the review gate after milestone 3. Stop there with screenshots and wait for me.
5. Vitest is required on the pure logic and on the new server endpoint (see "Tests"). The preview pane is verified by eye in the browser.
6. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before declaring any milestone done and report the results.
7. To verify the preview, use **throwaway projects outside this repo** — a tiny Vite app in a temp directory, plus a small server that sends `X-Frame-Options: DENY`. The two-repo rule stands: no project code is committed here. Test fixtures for the server endpoint are fine, since they're tests of this repo.
8. Once the interview has settled the decisions below, log them in `docs/decisions.md`, plus any others you make along the way.

## Scope

### 0. Fix the carried-over `useEditableDoc` bug

Phase 3's verification notes record it: after an edit has saved, if the file on disk is reverted to exactly its pre-edit text, Reload keeps showing the edited copy. The re-read hands back the same document object the working copy was based on, so the hook can't tell anything changed.

Fix it so that a re-read whose canonical text differs from the working copy's always takes over when clean, whatever object identity says. Add a regression test that reproduces the scenario at the level of the hook's state logic. Extract that logic into a pure reducer if that's what makes it testable. No other behaviour change to the ERD or Flows.

### 1. Editing `config.json` from the tool

- **One editing path for all three files.** Extend `useEditableDoc` to `'config'`, so config gets the same working copy, dirty flag, save status and focus re-read rules as the other two files. Move phase 1's inline project-name edit in the header, which currently calls `writeDesign` itself, onto it. Config edits are discrete commits (Enter or blur), so they save immediately rather than after the autosave delay.
- **Config operations** in `apps/web/src/config/ops.ts`: pure functions following the phase 2 conventions — same-object returns, and blank optionals removing their key. At minimum `renameProject` and `setPreviewUrl` (a blank value removes `url`). `devCommand` and `devices` aren't editable from the UI this phase, and every operation preserves them untouched.
- **URL validation** in a pure module (`apps/web/src/preview/url.ts`), used whenever I enter a URL in the tool:
  - It must parse as an absolute `http:` or `https:` URL. `localhost:5173` without a scheme is offered back as `http://localhost:5173`.
  - It must not point at modelwright itself: the web app's origin, or the server's port. The preview is sandboxed with `allow-same-origin` (see section 3), which is only safe because the preview never shares the tool's origin.
  - A hand-edited `config.json` with a URL that fails these rules isn't rejected by the schema, which stays unchanged. The UI view shows the "invalid URL" state for it instead.

### 2. Checking the preview — one new endpoint

A browser can't tell why a cross-origin iframe is blank, so the server checks for it.

- **`ProjectClient.checkPreview(url)`** → `{ status: 'ok' | 'unreachable' | 'refuses-embedding' | 'invalid', detail?: string }`. `httpClient` calls the server. Electron's IPC client will implement the same method in its main process later.
- **`POST /api/preview/check`** on the server, behind the existing origin/host guard:
  - It requests the URL with a short timeout (about 3 s) and a limited number of redirects. It returns only the classification and a short detail — never the response body.
  - **`refuses-embedding`** when the response sends `X-Frame-Options` (`DENY` or `SAMEORIGIN`), or a CSP `frame-ancestors` directive that doesn't allow the web app's origin. The detail names which header did it.
  - **`unreachable`** for a refused connection, a DNS failure or a timeout, with a detail saying which.
  - **`invalid`** for anything that isn't an absolute `http(s)` URL, or that points at the tool itself.
  - Any HTTP status, including 404 and 500, counts as **`ok`**, because the dev server is running and the iframe will show its own error page.
- This is the **only server change** this phase. It adds no file access.

### 3. The preview pane

When `config.json` has a valid preview URL, the UI view shows:

- **A preview toolbar** across the top of the view:
  - **a device toggle** built from `config.devices`, or the built-in presets (Mobile 390, Desktop 1280) when it has none, as a segmented control matching the header's; with more than four devices, it becomes a select
  - **the device size** (`390 × 844`, or `390 × fill` when the device has no height)
  - **the current scale** when the frame has been scaled down (`75%`)
  - **the preview URL**, double-click to edit inline with the same validation
  - **Reload preview**, which reloads only the iframe, not the design files
  - **Open in browser**, which opens the URL in a new tab
- **A device frame**, centred in the remaining space and drawn from tokens. It's a device-like frame for narrow devices and a plain window frame for wide ones; judge the look at the gate.
  - Width is the device's width. Height is the device's height, or all the available height when the device has none.
  - **Scale to fit:** if the frame is larger than the available area, scale it down with a CSS transform so it fits whole, and never scale it up. The iframe's own viewport stays at the device's real width, so the app's responsive layout behaves as it would on that device.
- **The iframe:**
  - Sandboxed with `allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads`, so real apps work, including their storage and cookies. `allow-same-origin` grants the preview its *own* origin's privileges. Combined with the URL rule in section 1, that never includes the tool's.
  - **Switching device resizes the frame without remounting the iframe**, so the app keeps its state and simply re-lays-out.
  - **Kept mounted after the first visit.** Switching to ERD or Flows hides the UI view rather than unmounting it, so coming back doesn't reload the app. Changing the preview URL remounts it.
- **Remembered per project:** the last chosen device, in `localStorage` (`preview-device:<projectPath>`), falling back to the first device.

### 4. States of the UI view

Each state is a card in the style of 05's empty states, unless a phase 4 design says otherwise:

| State | When | Shows |
|---|---|---|
| **No URL** | `preview.url` is absent | 05's "No preview URL set" card, now with a URL field and a "Set preview URL" button, prefilled with `http://localhost:5173` as a placeholder (not a value) |
| **Checking** | The first check is in flight | A quiet loading state. No flash if the check returns quickly. |
| **Nothing running** | `unreachable` | "Nothing running at <url>"; the detail; "Start your project's dev server" with `preview.devCommand` in a copyable snippet when one is set; "Checking again…" |
| **Refuses embedding** | `refuses-embedding` | Which header refused it and what that means, Open in browser, and a line on how to allow it (the dev server's frame headers) |
| **Invalid URL** | The URL fails the rules in section 1 | The problem, and the URL field to fix it |
| **Preview** | `ok` | The pane from section 3 |
| **Invalid config** | `config.json` fails validation | Phase 1's validation surface, unchanged |

**Rechecking:**

- The check runs when the UI view is shown, when the URL changes, and on Reload preview.
- While the state is "Nothing running", it re-runs every 3 seconds or so, so starting the dev server makes the preview appear on its own. Polling stops while the UI view is hidden or the window is unfocused.
- Once the preview is `ok`, it isn't re-checked in the background. If the dev server stops later, the iframe shows the browser's own error until I press Reload preview.

## Decisions this brief makes

Challenge any of these in the interview. Once settled, log them in `docs/decisions.md`.

- **modelwright never runs the dev server.** `devCommand` is a hint to copy, not a command to execute.
- **One editing path:** `useEditableDoc` covers `config` too, and the header's name edit moves onto it.
- **The schema doesn't change.** URL rules live in the tool, and a bad hand-edited URL is a view state, not a validation error.
- **The server classifies reachability and embeddability** through one new endpoint behind the existing guard, returning no response bodies.
- **The preview may never share the tool's origin,** which is what makes `allow-same-origin` safe.
- **Device switching resizes; it doesn't remount.** The iframe also stays mounted across view switches.
- **Scale down to fit, never up.** The iframe keeps the device's real viewport width.
- **A device without a height fills the available height.** The built-in presets stay as they are.
- **Poll only while "Nothing running"** and visible; no background health checks once the preview is up.

## Tests (Vitest)

- **Milestone 0:** a regression test for the revert-to-identical-text bug, plus the existing `useEditableDoc` behaviour it must not break.
- **`config/ops.ts`:** every operation, same-object returns, blank `url` removing the key, `devCommand` and `devices` preserved, every result passing `Config`.
- **`preview/url.ts`:** accepts `http(s)` absolute URLs; prefixes a bare `host:port`; rejects other schemes, relative URLs and the tool's own origin and port.
- **Scale-to-fit** as a pure function: fits whole, never above 1, handles devices with no height.
- **`/api/preview/check`**, against local test servers started inside the test:
  - a plain 200 → `ok`
  - a 404 or 500 → `ok`
  - a closed port → `unreachable`
  - a server that never responds → `unreachable` (timeout)
  - `X-Frame-Options: DENY` and `SAMEORIGIN` → `refuses-embedding`
  - CSP `frame-ancestors 'none'` → `refuses-embedding`; a `frame-ancestors` that includes the web app's origin → `ok`
  - a redirect chain within and beyond the limit
  - a non-`http(s)` URL, and the tool's own port → `invalid`
  - no response body is ever returned
  - the guard still rejects foreign origins

## Out of scope for phase 4

- Starting, stopping or watching the dev server, or running `devCommand`
- User-agent override, or device emulation beyond viewport width (accepted v1 trade-off; Electron fixes it)
- Editing `devices` from the UI (hand-edit `config.json`), rotating devices, side-by-side multi-device previews
- Linking flow screens or states to preview routes, or navigating the preview from the Flows canvas
- Auto-reloading the preview when design files change (the app's own HMR covers code changes)
- Screenshots or exports of the preview
- Undo/redo, dark mode, Mermaid export and new keyboard shortcuts (phase 5)
- Schema changes, and server changes beyond `/api/preview/check`. If another seems needed, stop and ask me.
- ERD or Flows behaviour changes, beyond the milestone 0 fix

## Milestones (one commit each, pushed)

0. **Fix the `useEditableDoc` revert bug,** with its regression test. ERD and Flows re-checked by hand.
1. **Config editing.** `useEditableDoc` for config, the header name edit moved onto it, `config/ops.ts`, `preview/url.ts`, and the URL field in the "No URL" state, all with tests.
2. **Preview check.** `/api/preview/check` with its tests, plus `ProjectClient.checkPreview` and its `httpClient` implementation.
3. **Preview pane and states — review gate.** The toolbar, device frame, scale-to-fit, iframe and every state in section 4. **Stop here.** Show me screenshots at a 1440×900 window of:
   - each state in section 4
   - the preview of a throwaway Vite app on Mobile and on Desktop
   - Desktop in a narrow window (around 1000 px wide), showing the scale-down

   Wait for my go-ahead. Expect changes to the frame and toolbar.
4. **Behaviour.** Polling while "Nothing running", the iframe kept mounted across view switches, device switching without remounting, device memory per project, Reload preview and Open in browser.
5. **Verified.** Walk the "done means" checklist below by hand, fix what it finds, and report the results.

## Done means

All of the following, demonstrated rather than asserted:

- [ ] `pnpm test`, `pnpm typecheck` and `pnpm lint` pass at the repo root.
- [ ] The ERD and Flows behave exactly as at the end of phase 3, except that reverting a design file to its pre-edit text and pressing Reload now shows the reverted content.
- [ ] Renaming the project in the header still works, now through the shared editing path, and the recents entry updates.
- [ ] With no preview URL, I can type `localhost:5173` into the UI view and it's saved as `http://localhost:5173`. Clearing the URL removes the key from `config.json`. `devCommand` and `devices` are untouched.
- [ ] Entering the tool's own address is refused with a clear message.
- [ ] With the URL set and nothing running, the view says so, shows `devCommand` when one is set, and the preview appears on its own within a few seconds of starting the dev server.
- [ ] A server sending `X-Frame-Options: DENY` shows the "refuses embedding" state, naming the header, with a working Open in browser.
- [ ] A running Vite app shows in the frame. Mobile is 390 wide and the app lays out as mobile; Desktop is 1280 and lays out as desktop. Switching between them keeps the app's state (e.g. text typed in a field survives).
- [ ] In a narrow window, Desktop scales down to fit and shows its scale; it never scales up in a wide one.
- [ ] Switching to ERD and back doesn't reload the preview.
- [ ] Custom `devices` in `config.json` replace the presets in the toggle. A device with a height uses it; one without fills the available height.
- [ ] The chosen device is remembered per project across reloads.
- [ ] Reload preview reloads only the iframe; the header's Reload still re-reads the design files.
- [ ] A hand-edited `config.json` with `"url": "ftp://x"` shows the invalid-URL state. A hand-broken `config.json` shows the validation surface with a warning dot on the UI segment, and the other views still work.

When every box is ticked and committed, phase 4 is complete, and with it all three views. Phase 5 (polish) starts in a new session.
