import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach } from 'vitest';
import { createCore, DesignWatcher, type Core } from '../src';

export const NOTES_FIXTURE = fileURLToPath(
  new URL('../../schema/test/fixtures/notes', import.meta.url),
);

export const FIXED_NOW = '2026-10-05T09:00:00.000Z';
export const TOOL_PORTS = [4300, 4301];

export interface Sandbox {
  root: string;
  home: string;
  now: Date;
  watcher: DesignWatcher;
  core: Core;
  emptyProject(name?: string): Promise<string>;
  notesProject(name?: string): Promise<string>;
}

/** A fresh temp directory and core per test, removed afterwards. */
export function useSandbox(): Sandbox {
  const sb = {} as Sandbox;
  beforeEach(async () => {
    sb.root = await mkdtemp(path.join(os.tmpdir(), 'modelwright-core-'));
    sb.home = path.join(sb.root, 'home');
    sb.now = new Date(FIXED_NOW);
    sb.watcher = new DesignWatcher(40);
    sb.core = createCore({
      homeDir: sb.home,
      userHome: sb.root,
      now: () => sb.now,
      toolPorts: TOOL_PORTS,
      watcher: sb.watcher,
    });
    sb.emptyProject = async (name = 'empty') => {
      const dir = path.join(sb.root, name);
      await mkdir(dir);
      return dir;
    };
    sb.notesProject = async (name = 'notes') => {
      const dir = await sb.emptyProject(name);
      await cp(NOTES_FIXTURE, path.join(dir, '.design'), { recursive: true });
      return dir;
    };
  });
  afterEach(async () => {
    sb.watcher.close();
    await rm(sb.root, { recursive: true, force: true });
  });
  return sb;
}

export function readDesignText(project: string, kind: string): Promise<string> {
  return readFile(path.join(project, '.design', `${kind}.json`), 'utf8');
}

/** The rejection of `promise`, which must reject. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected a rejection');
}
