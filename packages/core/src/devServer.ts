import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { DevServerEvent, DevServerState, StartDevServerResult } from '@modelwright/schema';
import { readTextOrNull, writeAtomic } from '@modelwright/project/node';

/**
 * The dev servers modelwright starts for projects, one per project at most. A server runs only
 * when asked and only once its exact command is approved for that project. It runs in its own
 * process group, so stopping it stops everything it started. Output is kept as the last lines.
 */

/** How a command is run: a shell and its arguments. The default is the user's login shell. */
export interface Shell {
  file: string;
  args: (command: string) => string[];
}

/**
 * The user's own shell, as a login, interactive shell, so a Dock-launched app gets the same
 * PATH as Terminal (nvm, pnpm, Homebrew).
 */
export const LOGIN_SHELL: Shell = {
  file: process.env['SHELL'] || '/bin/zsh',
  args: (command) => ['-ilc', command],
};

export const LOG_LINES = 500;
/** How long a stopped server has to exit after SIGTERM before its group is killed. */
export const STOP_GRACE_MS = 5000;

export interface DevServerOptions {
  /** modelwright's own state directory, for the approvals file. */
  homeDir: string;
  shell?: Shell;
  maxLines?: number;
  stopGraceMs?: number;
}

type Listener = (event: DevServerEvent) => void;

interface Server {
  child: ChildProcess | null;
  state: DevServerState;
  lines: string[];
  /** Unfinished last line of each stream. */
  partial: { stdout: string; stderr: string };
  listeners: Set<Listener>;
  /** Settles once the process has exited. */
  exited: Promise<void>;
}

export class DevServers {
  private readonly servers = new Map<string, Server>();
  private readonly approvals: Approvals;
  private readonly shell: Shell;
  private readonly maxLines: number;
  private readonly stopGraceMs: number;

  constructor({
    homeDir,
    shell = LOGIN_SHELL,
    maxLines = LOG_LINES,
    stopGraceMs = STOP_GRACE_MS,
  }: DevServerOptions) {
    this.approvals = new Approvals(homeDir);
    this.shell = shell;
    this.maxLines = maxLines;
    this.stopGraceMs = stopGraceMs;
  }

  state(dir: string): DevServerState {
    return this.servers.get(dir)?.state ?? { status: 'idle' };
  }

  /**
   * Starts `command` in `dir`, unless it's already running. An unapproved command runs only
   * with `approve`, which also records the approval, so the same command doesn't ask again.
   */
  async start(dir: string, command: string, approve: boolean): Promise<StartDevServerResult> {
    const current = this.servers.get(dir);
    if (current?.state.status === 'running') return { status: 'started', state: current.state };
    if (!(await this.approvals.has(dir, command))) {
      if (!approve) return { status: 'needs-approval', command, cwd: dir };
      await this.approvals.add(dir, command);
    }
    return { status: 'started', state: this.spawn(dir, command, current) };
  }

  /** Stops the server and everything it started. Resolves once they've gone. */
  async stop(dir: string): Promise<DevServerState> {
    const server = this.servers.get(dir);
    const pid = server?.child?.pid;
    if (!server || server.state.status !== 'running' || pid === undefined) return this.state(dir);
    signalGroup(pid, 'SIGTERM');
    const deadline = Date.now() + this.stopGraceMs;
    // The shell can exit before its children do, so wait for the whole group.
    while (groupAlive(pid)) {
      if (Date.now() >= deadline) {
        signalGroup(pid, 'SIGKILL');
        break;
      }
      await sleep(50);
    }
    await server.exited;
    return server.state;
  }

  /** Calls `listener` with a snapshot, then every change. Unsubscribing never stops the server. */
  watch(dir: string, listener: Listener): () => void {
    const server = this.ensure(dir);
    server.listeners.add(listener);
    listener({ type: 'snapshot', state: server.state, lines: [...server.lines] });
    return () => server.listeners.delete(listener);
  }

  /**
   * Stops every server, for shutdown: SIGTERM to each group, a short synchronous wait, then
   * SIGKILL for anything left. Synchronous, so it can run while the process exits.
   */
  stopAll(waitMs = 1500): void {
    const pids = [...this.servers.values()]
      .filter((s) => s.state.status === 'running' && s.child?.pid !== undefined)
      .map((s) => s.child?.pid as number);
    for (const pid of pids) signalGroup(pid, 'SIGTERM');
    const deadline = Date.now() + waitMs;
    while (pids.some(groupAlive) && Date.now() < deadline) sleepSync(50);
    for (const pid of pids) if (groupAlive(pid)) signalGroup(pid, 'SIGKILL');
  }

  private ensure(dir: string): Server {
    let server = this.servers.get(dir);
    if (!server) {
      server = {
        child: null,
        state: { status: 'idle' },
        lines: [],
        partial: { stdout: '', stderr: '' },
        listeners: new Set(),
        exited: Promise.resolve(),
      };
      this.servers.set(dir, server);
    }
    return server;
  }

  private spawn(dir: string, command: string, previous: Server | undefined): DevServerState {
    const server = previous ?? this.ensure(dir);
    server.lines = [];
    server.partial = { stdout: '', stderr: '' };
    let child: ChildProcess;
    try {
      child = spawn(this.shell.file, this.shell.args(command), {
        cwd: dir,
        // Its own process group, so stopping it stops what it starts.
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        // A dev server mustn't open a browser of its own; the preview is the browser.
        env: { ...process.env, BROWSER: 'none' },
      });
    } catch (err) {
      return this.setState(server, { status: 'exited', command, error: messageOf(err) });
    }
    server.child = child;
    let markExited = () => {};
    server.exited = new Promise((resolve) => (markExited = resolve));

    child.stdout?.on('data', (chunk: Buffer) => this.output(server, 'stdout', chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => this.output(server, 'stderr', chunk.toString()));
    child.on('error', (err) => {
      this.addLines(server, [`modelwright: couldn’t start the dev server: ${err.message}`]);
      this.setState(server, { ...server.state, status: 'exited', error: err.message });
      markExited();
    });
    child.on('close', (exitCode, signal) => {
      this.flush(server);
      if (server.state.status === 'running') {
        this.setState(server, { ...server.state, status: 'exited', exitCode, signal });
      }
      markExited();
    });

    // A fresh run: watchers start again from an empty log.
    server.state = {
      status: 'running',
      command,
      ...(child.pid !== undefined && { pid: child.pid }),
      startedAt: new Date().toISOString(),
    };
    for (const listener of server.listeners) {
      listener({ type: 'snapshot', state: server.state, lines: [] });
    }
    return server.state;
  }

  private output(server: Server, stream: 'stdout' | 'stderr', text: string): void {
    const parts = (server.partial[stream] + text).split(/\r?\n|\r/);
    server.partial[stream] = parts.pop() ?? '';
    this.addLines(server, parts.map(stripAnsi));
  }

  private flush(server: Server): void {
    const rest = [server.partial.stdout, server.partial.stderr].filter((p) => p !== '');
    server.partial = { stdout: '', stderr: '' };
    this.addLines(server, rest.map(stripAnsi));
  }

  private addLines(server: Server, lines: string[]): void {
    if (lines.length === 0) return;
    server.lines.push(...lines);
    if (server.lines.length > this.maxLines) {
      server.lines.splice(0, server.lines.length - this.maxLines);
    }
    for (const listener of server.listeners) listener({ type: 'output', lines });
  }

  private setState(server: Server, state: DevServerState): DevServerState {
    server.state = state;
    for (const listener of server.listeners) listener({ type: 'state', state });
    return state;
  }
}

// Terminal colours and cursor movement, which a log panel can't show.
const ANSI =
  // eslint-disable-next-line no-control-regex -- matching escape sequences is the point
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

/** A line without ANSI escape sequences. */
export function stripAnsi(line: string): string {
  return line.replace(ANSI, '');
}

const ApprovalsFile = z.object({
  approved: z.array(z.object({ project: z.string(), command: z.string() })),
});

/** Commands approved to run, per project, in modelwright's home. */
class Approvals {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly homeDir: string) {
    this.file = path.join(homeDir, 'approvals.json');
  }

  has(project: string, command: string): Promise<boolean> {
    return this.serialise(async () =>
      (await this.read()).some((a) => a.project === project && a.command === command),
    );
  }

  add(project: string, command: string): Promise<void> {
    return this.serialise(async () => {
      const list = await this.read();
      if (list.some((a) => a.project === project && a.command === command)) return;
      await fs.mkdir(this.homeDir, { recursive: true });
      const approved = [...list, { project, command }];
      await writeAtomic(this.file, `${JSON.stringify({ approved }, null, 2)}\n`);
    });
  }

  /** A missing or corrupt file approves nothing. */
  private async read() {
    const text = await readTextOrNull(this.file);
    if (text === null) return [];
    try {
      const parsed = ApprovalsFile.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data.approved : [];
    } catch {
      return [];
    }
  }

  private serialise<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

/** Whether any process in the group is still alive. */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but isn't ours to signal; count it as alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
