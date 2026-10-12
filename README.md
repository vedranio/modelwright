# modelwright

A local design tool for apps that Claude Code builds. You design the data model (ERD), the screens and flows, and check a live preview of the app. The `modelwright` Claude Code plugin then builds the app from that design, and on later runs applies only what changed since the last build.

modelwright only reads and writes a project's `.design/` folder. Each app lives in its own repo, never in this one.

- **[Using modelwright](docs/using-modelwright.md):** install the plugin and the app, and the design → build → check loop.
- [Decisions](docs/decisions.md): why things are the way they are.

## Quick start

modelwright is a macOS app (Apple silicon) that you build from this repo:

```bash
pnpm install
```

```bash
pnpm package
```

Open `apps/desktop/dist/modelwright-<version>-arm64.dmg` and drag **modelwright** onto **Applications**. Then install the plugin in Claude Code:

```bash
claude plugin marketplace add vedranio/modelwright
```

```bash
claude plugin install modelwright@modelwright --scope user
```

## Development

pnpm workspaces, TypeScript throughout. The app is an Electron shell (`apps/desktop`) around the web UI (`apps/web`). The same UI also runs in a browser against a small local server, which is the development and test harness:

```bash
pnpm dev
```

Then open http://127.0.0.1:4300. `pnpm dev:desktop` runs the desktop app from source with hot reload (quit the installed app first).

- **Checks:** `pnpm test`, `pnpm typecheck` and `pnpm lint` run across the repo. `pnpm e2e:desktop` drives the desktop app with Playwright, and `pnpm e2e:packaged` drives the packaged one.
- **The plugin's CLI:** `pnpm build:plugin` rebuilds the bundled CLI in `plugins/modelwright/bin/`, which is committed; a test checks it matches the source.

See `CLAUDE.md` for the architecture and conventions.
