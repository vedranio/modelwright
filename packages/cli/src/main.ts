import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  BuildMap,
  parseBuildRecord,
  parseConfig,
  stringifyBuildRecord,
  stringifyConfig,
  type BuildRecord,
  type DesignDocs,
  type Issue,
} from '@modelwright/schema';
import { changeCount, diffDesign, renderDiff } from '@modelwright/spec';
import {
  BUILD_FILE,
  buildFile,
  designDirState,
  designFile,
  loadDesign,
  readBuildRecord,
  readTextOrNull,
  regenerateSpec,
  validDesign,
  writeAtomic,
  type LoadedDesign,
} from '@modelwright/project/node';
import {
  TOOL_PORTS,
  normalizePreviewUrl,
  setDevCommand,
  setPreviewUrl,
} from '@modelwright/project/rules';

export interface Io {
  /** Where a relative project directory or file argument is resolved from. */
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** The clock `record-build` stamps the build with. */
  now: () => Date;
}

/** Exit codes: 0 done, 1 the command failed, 2 it was used wrongly. */
const OK = 0;
const FAILED = 1;
const USAGE = 2;

/** The web app's address, which a preview URL may not use. */
const TOOL_ORIGIN = 'http://localhost:4300';

export const USAGE_TEXT = `Usage: modelwright-design <command> [project-dir] [options]

Works on <project-dir>/.design/ (default: the current directory).

Commands:
  validate                 Check config.json, erd.json, flows.json and build.json
  spec                     Regenerate .design/spec.md from the design
  diff [--from <file>]     What changed since the last recorded build
  status                   One line: no build yet, up to date, or how many changes
  record-build [--map <file>]
                           Record the current design as built, with its code map
  set-preview --url <url> [--dev-command <cmd>]
                           Set the preview URL (and dev command) in config.json

Options:
  --json                   Print JSON instead of text
  -h, --help               Show this help
`;

class Failure extends Error {
  constructor(
    message: string,
    readonly issues: { file: string; issues: Issue[] }[] = [],
    readonly code = FAILED,
  ) {
    super(message);
  }
}

/** Runs one command. Resolves to the process exit code. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  let json = false;
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        from: { type: 'string' },
        map: { type: 'string' },
        url: { type: 'string' },
        'dev-command': { type: 'string' },
      },
    });
    json = values.json ?? false;
    const [command, dirArg, ...extra] = positionals;
    if (values.help || command === 'help') {
      io.stdout(USAGE_TEXT);
      return OK;
    }
    if (!command) throw new Failure(`No command given.\n\n${USAGE_TEXT}`, [], USAGE);
    if (extra.length) throw new Failure(`Unexpected argument "${extra[0]}".`, [], USAGE);
    const dir = path.resolve(io.cwd, dirArg ?? '.');
    const out = (text: string, data: unknown) =>
      io.stdout(json ? `${JSON.stringify(data, null, 2)}\n` : text);

    const allowed: Record<string, readonly string[]> = {
      validate: [],
      spec: [],
      diff: ['from'],
      status: [],
      'record-build': ['map'],
      'set-preview': ['url', 'dev-command'],
    };
    const options = allowed[command];
    if (!options) throw new Failure(`Unknown command "${command}".\n\n${USAGE_TEXT}`, [], USAGE);
    for (const key of ['from', 'map', 'url', 'dev-command'] as const) {
      if (values[key] !== undefined && !options.includes(key)) {
        throw new Failure(`--${key} doesn't apply to ${command}.`, [], USAGE);
      }
    }

    await requireDesignDir(dir);
    switch (command) {
      case 'validate':
        return await validate(dir, out);
      case 'spec':
        return await spec(dir, out);
      case 'diff':
        return await diff(dir, values.from && path.resolve(io.cwd, values.from), out);
      case 'status':
        return await status(dir, out);
      case 'record-build':
        return await recordBuild(
          dir,
          values.map && path.resolve(io.cwd, values.map),
          io.now(),
          out,
        );
      default:
        return await setPreview(dir, values.url, values['dev-command'], out);
    }
  } catch (err) {
    const failure =
      err instanceof Failure
        ? err
        : new Failure(
            err instanceof Error ? err.message : String(err),
            [],
            isUsage(err) ? USAGE : FAILED,
          );
    if (json) {
      io.stdout(
        `${JSON.stringify({ ok: false, error: failure.message, issues: failure.issues }, null, 2)}\n`,
      );
    } else {
      io.stderr(`${failure.message}\n${formatIssues(failure.issues)}`);
    }
    return failure.code;
  }
}

type Out = (text: string, data: unknown) => void;

// --- Commands ---

async function validate(dir: string, out: Out): Promise<number> {
  const loaded = await loadDesign(dir);
  const build = await readBuildRecord(dir);
  const files: { file: string; status: 'ok' | 'missing' | 'invalid' | 'none'; issues: Issue[] }[] =
    [
      ...(['config', 'erd', 'flows'] as const).map((kind) => {
        const state = loaded[kind];
        return {
          file: `${kind}.json`,
          status: state.status,
          issues: state.status === 'invalid' ? state.issues : [],
        };
      }),
      {
        file: BUILD_FILE,
        status: build.status,
        issues: build.status === 'invalid' ? build.issues : [],
      },
    ];
  const valid = files.every(
    (f) => f.status === 'ok' || (f.file === BUILD_FILE && f.status === 'none'),
  );
  const lines = files.map((f) => {
    if (f.status === 'ok') return `${f.file}: valid`;
    if (f.status === 'none') return `${f.file}: none yet`;
    if (f.status === 'missing') return `${f.file}: missing`;
    const count = f.issues.length;
    return `${f.file}: ${count} ${count === 1 ? 'problem' : 'problems'}\n${f.issues.map((i) => `  ${issueLine(i)}`).join('\n')}`;
  });
  out(`${lines.join('\n')}\n${valid ? 'The design is valid.' : 'The design has problems.'}\n`, {
    ok: valid,
    files,
  });
  return valid ? OK : FAILED;
}

async function spec(dir: string, out: Out): Promise<number> {
  requireValid(await loadDesign(dir));
  const wrote = await regenerateSpec(dir);
  out(wrote ? 'Wrote .design/spec.md.\n' : '.design/spec.md is already up to date.\n', {
    ok: true,
    wrote,
  });
  return OK;
}

async function diff(dir: string, from: string | undefined, out: Out): Promise<number> {
  const current = requireValid(await loadDesign(dir));
  const base = from ? await snapshotFromFile(from) : await lastBuild(dir);
  if (!base) {
    out('No build yet — this is a first build.\n', { ok: true, firstBuild: true });
    return OK;
  }
  const result = diffDesign(base.snapshot, current);
  const count = changeCount(result);
  const since = base.builtAt
    ? ` since the build of ${when(base.builtAt)}`
    : ` since ${path.basename(from ?? '')}`;
  out(`${count} ${count === 1 ? 'change' : 'changes'}${since}.\n\n${renderDiff(result)}`, {
    ok: true,
    firstBuild: false,
    builtAt: base.builtAt,
    changes: count,
    diff: result,
  });
  return OK;
}

async function status(dir: string, out: Out): Promise<number> {
  const current = requireValid(await loadDesign(dir));
  const base = await lastBuild(dir);
  if (!base) {
    out('No build yet\n', { ok: true, status: 'no-build' });
    return OK;
  }
  const count = changeCount(diffDesign(base.snapshot, current));
  const built = when(base.builtAt ?? '');
  out(
    count === 0
      ? `Up to date with the build of ${built}\n`
      : `${count} ${count === 1 ? 'change' : 'changes'} since the build of ${built}\n`,
    {
      ok: true,
      status: count === 0 ? 'up-to-date' : 'changed',
      builtAt: base.builtAt,
      changes: count,
    },
  );
  return OK;
}

async function recordBuild(
  dir: string,
  mapFile: string | undefined,
  now: Date,
  out: Out,
): Promise<number> {
  const design = requireValid(await loadDesign(dir));
  const previous = await readBuildRecord(dir);
  if (previous.status === 'invalid') {
    throw new Failure(
      `${BUILD_FILE} is invalid. Fix it or delete it, then record the build again.`,
      [{ file: BUILD_FILE, issues: previous.issues }],
    );
  }
  const incoming = mapFile ? await readMap(mapFile) : {};
  const map = mergeMaps(
    previous.status === 'ok' ? previous.record.map : undefined,
    incoming,
    design,
  );
  const record: BuildRecord = {
    schemaVersion: 1,
    builtAt: now.toISOString(),
    snapshot: design,
    ...(map && { map }),
  };
  const checked = parseBuildRecord(record);
  if (!checked.ok) {
    throw new Failure('The build record would be invalid.', [
      { file: BUILD_FILE, issues: checked.issues },
    ]);
  }
  await writeAtomic(buildFile(dir), stringifyBuildRecord(checked.record));
  const counts = {
    entities: Object.keys(map?.entities ?? {}).length,
    screens: Object.keys(map?.screens ?? {}).length,
    states: Object.values(map?.states ?? {}).reduce((n, s) => n + Object.keys(s).length, 0),
  };
  out(
    `Recorded the build of ${when(record.builtAt)} in .design/${BUILD_FILE}. Mapped ${count(counts.entities, 'entity', 'entities')}, ${count(counts.screens, 'screen', 'screens')} and ${count(counts.states, 'state', 'states')}.\n`,
    { ok: true, builtAt: record.builtAt, mapped: counts },
  );
  return OK;
}

async function setPreview(
  dir: string,
  url: string | undefined,
  devCommand: string | undefined,
  out: Out,
): Promise<number> {
  if (url === undefined) throw new Failure('set-preview needs --url <url>.', [], USAGE);
  const loaded = await loadDesign(dir);
  const config = loaded.config;
  if (config.status !== 'ok') {
    throw new Failure(
      config.status === 'missing' ? 'config.json is missing.' : 'config.json is invalid.',
      config.status === 'invalid' ? [{ file: 'config.json', issues: config.issues }] : [],
    );
  }
  const checked = normalizePreviewUrl(url, { toolOrigin: TOOL_ORIGIN, toolPorts: TOOL_PORTS });
  if (!checked.ok) throw new Failure(checked.problem);

  let next = setPreviewUrl(config.doc, checked.url);
  if (devCommand !== undefined) next = setDevCommand(next, devCommand);
  const parsed = parseConfig(next);
  if (!parsed.ok)
    throw new Failure('config.json would be invalid.', [
      { file: 'config.json', issues: parsed.error.issues },
    ]);
  const text = stringifyConfig(parsed.doc);
  const changed = text !== config.text;
  if (changed) await writeAtomic(designFile(dir, 'config'), text);
  const specWritten = await regenerateSpec(dir);

  const { preview } = parsed.doc;
  const command = preview.devCommand ? ` (dev command: ${preview.devCommand})` : '';
  out(
    changed
      ? `Set the preview to ${preview.url}${command}.\n`
      : `The preview is already ${preview.url}${command}.\n`,
    { ok: true, changed, preview, specWritten },
  );
  return OK;
}

// --- Helpers ---

async function requireDesignDir(dir: string): Promise<void> {
  let state;
  try {
    state = await designDirState(dir);
  } catch {
    throw new Failure(`Can't read ${dir}.`);
  }
  if (state === 'missing') {
    throw new Failure(`No .design/ folder in ${dir}. Open the project in modelwright first.`);
  }
  if (state === 'invalid') {
    throw new Failure(
      `${path.join(dir, '.design')} isn't a real folder (a symlink isn't allowed).`,
    );
  }
}

/** The design, or a failure listing every problem. */
function requireValid(loaded: LoadedDesign): DesignDocs {
  const design = validDesign(loaded);
  if (design) return design;
  const problems = (['config', 'erd', 'flows'] as const).flatMap((kind) => {
    const state = loaded[kind];
    if (state.status === 'missing') {
      return [{ file: `${kind}.json`, issues: [{ path: [], message: 'File is missing' }] }];
    }
    return state.status === 'invalid' ? [{ file: `${kind}.json`, issues: state.issues }] : [];
  });
  throw new Failure('The design has problems. Fix them in modelwright first.', problems);
}

interface Base {
  snapshot: DesignDocs;
  builtAt?: string;
}

async function lastBuild(dir: string): Promise<Base | null> {
  const read = await readBuildRecord(dir);
  if (read.status === 'none') return null;
  if (read.status === 'invalid') {
    throw new Failure(`${BUILD_FILE} is invalid.`, [{ file: BUILD_FILE, issues: read.issues }]);
  }
  return { snapshot: read.record.snapshot, builtAt: read.record.builtAt };
}

/** A build record, or a bare `{ config, erd, flows }` snapshot, from a file. */
async function snapshotFromFile(file: string): Promise<Base> {
  const data = await readJsonFile(file);
  const asRecord = parseBuildRecord(data);
  if (asRecord.ok) return { snapshot: asRecord.record.snapshot, builtAt: asRecord.record.builtAt };
  // Not a build record: try it as a bare snapshot by wrapping it in one.
  const wrapped = parseBuildRecord({
    schemaVersion: 1,
    builtAt: new Date(0).toISOString(),
    snapshot: data,
  });
  if (wrapped.ok) return { snapshot: wrapped.record.snapshot };
  const name = path.basename(file);
  const issues = wrapped.issues.map((i) => ({ ...i, path: i.path.slice(1) }));
  throw new Failure(`${name} is neither a build record nor a design snapshot.`, [
    { file: name, issues },
  ]);
}

async function readMap(file: string): Promise<BuildMap> {
  const result = BuildMap.safeParse(await readJsonFile(file));
  if (!result.success) {
    const name = path.basename(file);
    throw new Failure(`${name} isn't a valid build map.`, [
      {
        file: name,
        issues: result.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === 'number' ? p : String(p))),
          message: i.message,
        })),
      },
    ]);
  }
  return result.data;
}

async function readJsonFile(file: string): Promise<unknown> {
  const text = await readTextOrNull(file);
  if (text === null) throw new Failure(`No file at ${file}.`);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Failure(
      `${path.basename(file)} isn't valid JSON: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * The previous map with the new one laid over it, id by id, keeping only ids the design still
 * has. `undefined` when nothing is mapped.
 */
export function mergeMaps(
  previous: BuildMap | undefined,
  incoming: BuildMap,
  design: DesignDocs,
): BuildMap | undefined {
  const entityIds = new Set(design.erd.entities.map((e) => e.id));
  const screens = new Map(design.flows.screens.map((s) => [s.id, s]));
  const keep = <T>(record: Record<string, T>, has: (id: string) => boolean) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => has(id)));

  const entities = keep({ ...previous?.entities, ...incoming.entities }, (id) => entityIds.has(id));
  const screenRefs = keep({ ...previous?.screens, ...incoming.screens }, (id) => screens.has(id));
  const states: Record<string, Record<string, string[]>> = {};
  for (const screenId of new Set([
    ...Object.keys(previous?.states ?? {}),
    ...Object.keys(incoming.states ?? {}),
  ])) {
    const screen = screens.get(screenId);
    if (!screen) continue;
    const stateIds = new Set(screen.states.map((s) => s.id));
    const merged = keep({ ...previous?.states?.[screenId], ...incoming.states?.[screenId] }, (id) =>
      stateIds.has(id),
    );
    if (Object.keys(merged).length) states[screenId] = merged;
  }

  const map: BuildMap = {
    ...(Object.keys(entities).length && { entities }),
    ...(Object.keys(screenRefs).length && { screens: screenRefs }),
    ...(Object.keys(states).length && { states }),
  };
  return Object.keys(map).length ? map : undefined;
}

function formatIssues(groups: { file: string; issues: Issue[] }[]): string {
  return groups
    .map(({ file, issues }) => issues.map((i) => `  ${file}: ${issueLine(i)}\n`).join(''))
    .join('');
}

/** An issue as the validation surface shows it: "entities › 0 › name: message". */
function issueLine(issue: Issue): string {
  const where = issue.path.length === 0 ? '(whole file)' : issue.path.map(String).join(' › ');
  return `${where}: ${issue.message}`;
}

/** "2026-10-06 09:30 UTC": a timestamp people can read, the same on every machine. */
function when(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
}

function isUsage(err: unknown): boolean {
  return err instanceof Error && 'code' in err && String(err.code).startsWith('ERR_PARSE_ARGS');
}

/** "1 screen", "2 screens". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
