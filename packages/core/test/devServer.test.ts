import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DevServerEvent } from '@modelwright/schema';
import { CoreError, DevServers, announcedUrls, createCore, stripAnsi } from '../src';
import { TOOL_PORTS, rejection, useSandbox } from './helpers';

const sb = useSandbox();
const SH = { file: '/bin/sh', args: (command: string) => ['-c', command] };
const NODE = JSON.stringify(process.execPath);

const managers: DevServers[] = [];
function servers(options: { maxLines?: number; stopGraceMs?: number } = {}) {
  const m = new DevServers({ homeDir: sb.home, shell: SH, ...options });
  managers.push(m);
  return m;
}
afterEach(() => {
  for (const m of managers.splice(0)) m.stopAll(200);
});

function collect(m: DevServers, dir: string) {
  const events: DevServerEvent[] = [];
  m.watch(dir, (e) => events.push(e));
  const lines = () =>
    events.flatMap((e) => (e.type === 'output' ? e.lines : e.type === 'snapshot' ? e.lines : []));
  return { events, lines };
}

const until = async (check: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

function alive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('approval', () => {
  it('runs nothing until the command is approved, then remembers it per command', async () => {
    const dir = await sb.emptyProject();
    const m = servers();
    expect(await m.start(dir, 'echo hi', false)).toEqual({
      status: 'needs-approval',
      command: 'echo hi',
      cwd: dir,
    });
    expect(m.state(dir).status).toBe('idle');

    const started = await m.start(dir, 'echo hi', true);
    expect(started.status).toBe('started');
    const file = JSON.parse(await readFile(path.join(sb.home, 'approvals.json'), 'utf8'));
    expect(file.approved).toEqual([{ project: dir, command: 'echo hi' }]);

    await until(() => m.state(dir).status === 'exited');
    expect((await m.start(dir, 'echo hi', false)).status).toBe('started');
    await until(() => m.state(dir).status === 'exited');
    expect((await m.start(dir, 'echo changed', false)).status).toBe('needs-approval');
  });

  it('approves per project', async () => {
    const a = await sb.emptyProject('a');
    const b = await sb.emptyProject('b');
    const m = servers();
    await m.start(a, 'echo hi', true);
    expect((await m.start(b, 'echo hi', false)).status).toBe('needs-approval');
  });
});

describe('a running server', () => {
  it('streams its output, without terminal colours, and reports its exit code', async () => {
    const dir = await sb.emptyProject();
    const m = servers();
    const { events, lines } = collect(m, dir);
    await m.start(dir, `printf 'one\\n\\033[32mtwo\\033[0m\\nthree'; exit 3`, true);
    await until(() => m.state(dir).status === 'exited');
    expect(lines()).toEqual(['one', 'two', 'three']);
    expect(m.state(dir)).toMatchObject({ status: 'exited', exitCode: 3 });
    expect(events.some((e) => e.type === 'state' && e.state.status === 'exited')).toBe(true);
  });

  it('runs in the project folder', async () => {
    const dir = await sb.emptyProject();
    const m = servers();
    const { lines } = collect(m, dir);
    await m.start(dir, 'pwd', true);
    await until(() => m.state(dir).status === 'exited');
    expect(lines().map((l) => l.replace('/private', ''))).toEqual([dir.replace('/private', '')]);
  });

  it('keeps only the last lines', async () => {
    const dir = await sb.emptyProject();
    const m = servers({ maxLines: 3 });
    await m.start(dir, 'for i in 1 2 3 4 5 6; do echo $i; done', true);
    await until(() => m.state(dir).status === 'exited');
    const late: string[] = [];
    m.watch(dir, (e) => e.type === 'snapshot' && late.push(...e.lines));
    expect(late).toEqual(['4', '5', '6']);
  });

  it('doesn’t start twice', async () => {
    const dir = await sb.emptyProject();
    const m = servers();
    const first = await m.start(dir, 'sleep 5', true);
    const second = await m.start(dir, 'sleep 5', true);
    expect(first.status === 'started' && second.status === 'started').toBe(true);
    if (first.status === 'started' && second.status === 'started') {
      expect(second.state.pid).toBe(first.state.pid);
    }
  });
});

describe('stopping', () => {
  it('stops the whole process group, a child that ignores SIGTERM included', async () => {
    const dir = await sb.emptyProject();
    const m = servers({ stopGraceMs: 300 });
    const stubborn = `${NODE} -e "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"`;
    const result = await m.start(dir, `${stubborn} & wait`, true);
    const pid = result.status === 'started' ? (result.state.pid as number) : -1;
    await new Promise((r) => setTimeout(r, 300));
    expect(alive(pid)).toBe(true);
    const state = await m.stop(dir);
    expect(state.status).toBe('exited');
    expect(alive(pid)).toBe(false);
  });

  it('stops everything at shutdown', async () => {
    const a = await sb.emptyProject('a');
    const b = await sb.emptyProject('b');
    const m = servers();
    const pids = await Promise.all(
      [a, b].map(async (dir) => {
        const r = await m.start(dir, 'sleep 30', true);
        return r.status === 'started' ? (r.state.pid as number) : -1;
      }),
    );
    m.stopAll(500);
    await until(() => pids.every((pid) => !alive(pid)));
  });

  it('stopping a server that isn’t running changes nothing', async () => {
    const dir = await sb.emptyProject();
    expect(await servers().stop(dir)).toEqual({ status: 'idle' });
  });
});

describe('through the core', () => {
  it('runs the command in config.json, and refuses a project without one', async () => {
    const dir = await sb.notesProject();
    const core = createCore({
      homeDir: sb.home,
      toolPorts: TOOL_PORTS,
      devServers: servers(),
    });
    const err = await rejection(core.startDevServer(dir));
    expect(err).toBeInstanceOf(CoreError);
    expect((err as CoreError).code).toBe('conflict');

    const file = path.join(dir, '.design', 'config.json');
    const config = JSON.parse(await readFile(file, 'utf8'));
    config.preview.devCommand = 'echo from-config';
    await writeFile(file, JSON.stringify(config));
    expect(await core.startDevServer(dir)).toEqual({
      status: 'needs-approval',
      command: 'echo from-config',
      cwd: dir,
    });
    expect((await core.startDevServer(dir, true)).status).toBe('started');
  });
});

describe('stripAnsi', () => {
  it('removes colours, cursor moves and links', () => {
    expect(stripAnsi('\u001b[1m\u001b[32mVITE\u001b[39m\u001b[22m ready')).toBe('VITE ready');
    expect(stripAnsi('\u001b[2K\u001b[1Gdone')).toBe('done');
    expect(stripAnsi('\u001b]8;;http://x\u0007link\u001b]8;;\u0007')).toBe('link');
  });
});

describe('announcedUrls', () => {
  it('finds the local addresses dev servers print', () => {
    expect(
      announcedUrls([
        '  ➜  Local:   http://localhost:5174/',
        '  ➜  Network: http://192.168.1.4:5174/',
        '   - Local:        http://localhost:3000',
        '* Listening on http://127.0.0.1:3001',
        'Listening on http://0.0.0.0:8080',
        'again http://localhost:5174/',
      ]),
    ).toEqual([
      'http://localhost:5174/',
      'http://localhost:3000',
      'http://127.0.0.1:3001',
      'http://localhost:8080',
    ]);
  });
});
