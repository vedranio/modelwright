# modelwright

A local design tool for apps that Claude Code builds. You design the data model (ERD), the screens and flows, and check a live preview of the app. The `modelwright` Claude Code plugin then builds the app from that design, and on later runs applies only what changed since the last build.

modelwright only reads and writes a project's `.design/` folder. Each app lives in its own repo, never in this one.

- **[Using modelwright](docs/using-modelwright.md):** install the plugin, start modelwright, and the design → build → check loop.
- [Decisions](docs/decisions.md): why things are the way they are.

## Quick start

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://127.0.0.1:4300, and install the plugin in Claude Code:

```bash
claude plugin marketplace add vedranio/modelwright
```

```bash
claude plugin install modelwright@modelwright --scope user
```

## Development

pnpm workspaces, TypeScript throughout. `pnpm test`, `pnpm typecheck` and `pnpm lint` run across the repo. `pnpm build:plugin` rebuilds the bundled CLI in `plugins/modelwright/bin/`, which is committed; a test checks it matches the source. See `CLAUDE.md` for the architecture and conventions.
