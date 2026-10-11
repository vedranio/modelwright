import { describe, expect, it } from 'vitest';
import {
  ProjectClientError,
  type DesignChange,
  type DevServerEvent,
  type ProjectClient,
} from '../../../apps/web/src/platform/ProjectClient';

/**
 * The `ProjectClient` contract: the same cases and expectations for every implementation.
 * Each runner (httpClient over the server, ipcClient over the main-process handlers) provides
 * a fresh client per test and the disk helpers, which live outside the web app.
 */
export interface ContractHarness {
  client(): ProjectClient;
  /** A project folder whose `.design/` is the notes fixture. */
  notesProject(name?: string): Promise<string>;
  /** An empty folder. */
  emptyProject(name?: string): Promise<string>;
  /** The folder the harness treats as the user's home. */
  home(): string;
  readText(project: string, kind: string): Promise<string>;
  /** Writes a design file from outside modelwright, as a text editor would. */
  writeText(project: string, kind: string, text: string): Promise<void>;
  /** A dev command that prints `ready` and keeps running. */
  devCommand: string;
}

const settle = () => new Promise((r) => setTimeout(r, 400));

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

const loggedLines = (events: DevServerEvent[]) =>
  events.flatMap((e) => (e.type === 'state' ? [] : e.lines));

async function failure(promise: Promise<unknown>): Promise<ProjectClientError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProjectClientError) return err;
    throw err;
  }
  throw new Error('Expected the call to fail');
}

export function runProjectClientContract(name: string, h: ContractHarness): void {
  describe(`ProjectClient contract: ${name}`, () => {
    it('opens a project and lists, then removes, it in recents', async () => {
      const client = h.client();
      const dir = await h.notesProject();
      const summary = await client.openProject(dir);
      expect(summary).toMatchObject({ path: dir, initialised: true });
      expect(typeof summary.lastOpenedAt).toBe('string');
      expect((await client.listRecent()).map((p) => p.path)).toEqual([dir]);
      await client.removeRecent(dir);
      expect(await client.listRecent()).toEqual([]);
    });

    it('fails to open a missing folder with status 404', async () => {
      const err = await failure(h.client().openProject(`${h.home()}/missing`));
      expect(err.status).toBe(404);
    });

    it('fails on a relative path with status 400', async () => {
      expect((await failure(h.client().openProject('relative'))).status).toBe(400);
    });

    it('initialises a folder, and refuses a second time with 409', async () => {
      const client = h.client();
      const dir = await h.emptyProject();
      expect(await client.initProject(dir, 'Fresh')).toMatchObject({
        name: 'Fresh',
        initialised: true,
      });
      expect((await failure(client.initProject(dir))).status).toBe(409);
    });

    it('creates a project under ~', async () => {
      const summary = await h.client().createProject('~', 'Created', false);
      expect(summary).toMatchObject({ name: 'Created', initialised: true });
      expect(summary.displayPath).toMatch(/^~.Created$/);
    });

    it('reads and writes a design file', async () => {
      const client = h.client();
      const dir = await h.notesProject();
      const config = await client.readDesign(dir, 'config');
      await client.writeDesign(dir, 'config', { ...config, name: 'Renamed' });
      expect((await client.readDesign(dir, 'config')).name).toBe('Renamed');
      expect(JSON.parse(await h.readText(dir, 'config')).name).toBe('Renamed');
    });

    it('rejects an invalid write with 422 and its issues, leaving the file', async () => {
      const client = h.client();
      const dir = await h.notesProject();
      const before = await h.readText(dir, 'erd');
      const err = await failure(client.writeDesign(dir, 'erd', { nonsense: true } as never));
      expect(err.status).toBe(422);
      expect(err.message).toBe('erd.json is invalid');
      expect(err.issues?.length).toBeGreaterThan(0);
      expect(await h.readText(dir, 'erd')).toBe(before);
    });

    it('reports a corrupted file with 422 and its issues', async () => {
      const dir = await h.notesProject();
      await h.writeText(dir, 'flows', '{');
      const err = await failure(h.client().readDesign(dir, 'flows'));
      expect(err.status).toBe(422);
      expect(err.issues?.length).toBeGreaterThan(0);
    });

    it('refuses a write to a folder without .design/ with 409', async () => {
      const client = h.client();
      const erd = await client.readDesign(await h.notesProject(), 'erd');
      const err = await failure(client.writeDesign(await h.emptyProject(), 'erd', erd));
      expect(err.status).toBe(409);
    });

    it('reads a missing build record as none', async () => {
      expect(await h.client().readBuildRecord(await h.notesProject())).toEqual({ status: 'none' });
    });

    it('checks a preview URL', async () => {
      const client = h.client();
      expect((await client.checkPreview('http://127.0.0.1:1/')).status).toBe('unreachable');
      expect((await client.checkPreview('ftp://x')).status).toBe('invalid');
      expect((await client.checkPreview('http://localhost:4301/')).status).toBe('invalid');
    });

    it('reports external changes until unsubscribed, but not its own writes', async () => {
      const client = h.client();
      const dir = await h.notesProject();
      const seen: DesignChange[] = [];
      const stop = client.watchDesign(dir, (change) => seen.push(change));
      await settle();

      await client.writeDesign(dir, 'erd', await client.readDesign(dir, 'erd'));
      await h.writeText(dir, 'flows', `${await h.readText(dir, 'flows')} `);
      await settle();
      expect(seen).toEqual([{ kind: 'flows' }]);

      stop();
      await settle();
      await h.writeText(dir, 'flows', `${await h.readText(dir, 'flows')}\n`);
      await settle();
      expect(seen).toEqual([{ kind: 'flows' }]);
    });

    describe('the dev server', () => {
      async function withDevCommand(command: string): Promise<string> {
        const dir = await h.notesProject();
        const config = JSON.parse(await h.readText(dir, 'config'));
        config.preview.devCommand = command;
        await h.writeText(dir, 'config', JSON.stringify(config));
        return dir;
      }

      it('runs config.json’s command once approved, streams its output, and stops it', async () => {
        const client = h.client();
        const dir = await withDevCommand(h.devCommand);
        expect(await client.devServer.start(dir, false)).toEqual({
          status: 'needs-approval',
          command: h.devCommand,
          cwd: dir,
        });
        expect((await client.devServer.state(dir)).status).toBe('idle');

        const events: DevServerEvent[] = [];
        const unwatch = client.devServer.watch(dir, (e) => events.push(e));
        const started = await client.devServer.start(dir, true);
        expect(started.status).toBe('started');
        await until(() => loggedLines(events).includes('ready'));
        expect((await client.devServer.state(dir)).status).toBe('running');

        expect((await client.devServer.stop(dir)).status).toBe('exited');
        await until(() => events.some((e) => e.type === 'state' && e.state.status === 'exited'));
        unwatch();
      });

      it('remembers an approval, and asks again when the command changes', async () => {
        const client = h.client();
        const dir = await withDevCommand(h.devCommand);
        await client.devServer.start(dir, true);
        await client.devServer.stop(dir);
        expect((await client.devServer.start(dir, false)).status).toBe('started');
        await client.devServer.stop(dir);
        const changed = `${h.devCommand} # changed`;
        const config = JSON.parse(await h.readText(dir, 'config'));
        config.preview.devCommand = changed;
        await h.writeText(dir, 'config', JSON.stringify(config));
        expect((await client.devServer.start(dir, false)).status).toBe('needs-approval');
      });

      it('refuses a project without a dev command with 409', async () => {
        const err = await failure(h.client().devServer.start(await h.notesProject(), true));
        expect(err.status).toBe(409);
      });
    });
  });
}
