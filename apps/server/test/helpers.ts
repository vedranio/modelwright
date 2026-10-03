import { cp, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach } from 'vitest';
import { createApp } from '../src/app';

const NOTES_FIXTURE = fileURLToPath(
  new URL('../../../packages/schema/test/fixtures/notes', import.meta.url),
);

export interface Sandbox {
  /** Root of this test's temp directory. */
  root: string;
  /** modelwright's home (recents) for this test. */
  home: string;
  app: ReturnType<typeof createApp>;
  /** Sends a request as the web app would, through the guard. */
  call(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response>;
  /** Creates an empty project folder and returns its path. */
  emptyProject(name?: string): Promise<string>;
  /** Creates a project folder whose `.design/` is a copy of the notes fixture. */
  notesProject(name?: string): Promise<string>;
}

/** A fresh temp directory and app per test, removed afterwards. */
export function useSandbox(): Sandbox {
  const sandbox = {} as Sandbox;

  beforeEach(async () => {
    sandbox.root = await mkdtemp(path.join(os.tmpdir(), 'modelwright-test-'));
    sandbox.home = path.join(sandbox.root, 'home');
    sandbox.app = createApp({ homeDir: sandbox.home });

    sandbox.call = (method, url, body, headers = {}) =>
      Promise.resolve(
        sandbox.app.request(url, {
          method,
          headers: {
            host: '127.0.0.1:4301',
            ...(body !== undefined && { 'content-type': 'application/json' }),
            ...headers,
          },
          ...(body !== undefined && {
            body: typeof body === 'string' ? body : JSON.stringify(body),
          }),
        }),
      );

    sandbox.emptyProject = async (name = 'empty') => {
      const dir = path.join(sandbox.root, name);
      await mkdir(dir);
      return dir;
    };

    sandbox.notesProject = async (name = 'notes') => {
      const dir = await sandbox.emptyProject(name);
      await cp(NOTES_FIXTURE, path.join(dir, '.design'), { recursive: true });
      return dir;
    };
  });

  afterEach(async () => {
    await rm(sandbox.root, { recursive: true, force: true });
  });

  return sandbox;
}

export function designPath(project: string, kind: string): string {
  return path.join(project, '.design', `${kind}.json`);
}

export function readDesignText(project: string, kind: string): Promise<string> {
  return readFile(designPath(project, kind), 'utf8');
}

export function designUrl(kind: string, project: string): string {
  return `/api/design/${kind}?path=${encodeURIComponent(project)}`;
}

export async function listDesignDir(project: string): Promise<string[]> {
  return (await readdir(path.join(project, '.design'))).sort();
}

/** A response body as `any`, so assertions can reach into it without casts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only convenience
export async function json(res: Response): Promise<any> {
  return res.json();
}
