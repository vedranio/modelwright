import os from 'node:os';
import {
  parseDesign,
  parseDesignJson,
  stringifyDesign,
  type BuildRead,
  type Config,
  type DesignDoc,
  type DesignKind,
  type PreviewCheck,
  type ProjectSummary,
} from '@modelwright/schema';
import {
  readBuildRecord,
  readTextOrNull,
  regenerateSpec,
  writeAtomic,
} from '@modelwright/project/node';
import { CoreError } from './errors';
import { checkPreview, PREVIEW_TIMEOUT_MS } from './previewCheck';
import { designDirState, designFile, resolveParentDir, resolveProjectDir, tildify } from './paths';
import { createProject, initialise, isInitialised, summarise } from './projects';
import { demoDir, offerDemo } from './demo';
import { Recents } from './recents';
import { DesignWatcher, type DesignChangeListener } from './watcher';

export interface CoreOptions {
  /** modelwright's own state directory (recents, the demo). */
  homeDir: string;
  /** The user's home directory, shown as `~` in display paths. */
  userHome?: string;
  /** Clock for recents timestamps. */
  now?: () => Date;
  /** modelwright's own ports, which a preview URL may not use on a loopback host. */
  toolPorts: readonly number[];
  /** How long a preview check waits for a response. */
  previewTimeoutMs?: number;
  /** Watches open projects' design files for changes made outside modelwright. */
  watcher?: DesignWatcher;
  /** The demo project's template, offered once per install; none (tests) offers no demo. */
  demoTemplate?: string;
}

export interface PreviewCheckContext {
  /** The tool's own origin: a preview URL there is refused, and frame headers must allow it. */
  toolOrigin: string;
  /**
   * Whether the preview is shown in a frame, so frame-blocking headers matter. The desktop app
   * shows it as a top-level page, where they don't apply.
   */
  framing?: boolean;
}

/**
 * Every project operation modelwright has, as plain async functions with typed results.
 * Failures are `CoreError`s. The Hono server and Electron's main process are thin adapters
 * over this: they validate and map arguments, and map errors onto their wire formats.
 */
export function createCore({
  homeDir,
  userHome = os.homedir(),
  now,
  toolPorts,
  previewTimeoutMs = PREVIEW_TIMEOUT_MS,
  watcher = new DesignWatcher(),
  demoTemplate,
}: CoreOptions) {
  const recents = new Recents(homeDir, now);
  // Offered before the first listing, once per process; offerDemo itself remembers per install.
  const demoReady = demoTemplate ? offerDemo(homeDir, recents, demoTemplate) : Promise.resolve();
  const demoPath = demoDir(homeDir);

  async function opened(dir: string): Promise<ProjectSummary> {
    const summary = await summarise(dir, userHome);
    const { lastOpenedAt } = await recents.add({ path: summary.path, name: summary.name });
    return { ...summary, lastOpenedAt };
  }

  async function requireDesignDir(dir: string): Promise<void> {
    if ((await designDirState(dir)) !== 'dir') {
      throw new CoreError('conflict', `modelwright is not initialised in ${dir}`);
    }
  }

  return {
    /** Validates a project path: absolute, an existing folder. Returns it normalised. */
    resolveProjectDir,

    async openProject(path: string): Promise<ProjectSummary> {
      return opened(await resolveProjectDir(path));
    },

    async initProject(path: string, name?: string): Promise<ProjectSummary> {
      const dir = await resolveProjectDir(path);
      await initialise(dir, name, (kind, text) => watcher.noteWrite(dir, kind, text));
      await refreshSpec(dir);
      return opened(dir);
    },

    /** A new project: its folder, its `.design/` and optionally a git repository. */
    async createProject(parent: string, name: string, git = false): Promise<ProjectSummary> {
      const parentDir = await resolveParentDir(parent, userHome);
      const dir = await createProject(parentDir, name, {
        git,
        onWrite: (dir, kind, text) => watcher.noteWrite(dir, kind, text),
      });
      await refreshSpec(dir);
      return opened(dir);
    },

    async listRecent(): Promise<ProjectSummary[]> {
      await demoReady;
      const list = await recents.list();
      return Promise.all(
        list.map(async (entry) => ({
          path: entry.path,
          displayPath: tildify(entry.path, userHome),
          name: entry.name,
          initialised: await isInitialised(entry.path),
          ...(entry.path === demoPath && { demo: true }),
          ...(entry.lastOpenedAt !== undefined && { lastOpenedAt: entry.lastOpenedAt }),
        })),
      );
    },

    async removeRecent(path: string): Promise<void> {
      await recents.remove(path);
    },

    async readDesign<K extends DesignKind>(path: string, kind: K): Promise<DesignDoc<K>> {
      const dir = await resolveProjectDir(path);
      const text = await readTextOrNull(designFile(dir, kind));
      if (text === null)
        throw new CoreError('not-found', `.design/${kind}.json not found in ${dir}`);
      const result = parseDesignJson(kind, text);
      if (!result.ok) throw CoreError.invalidDesign(result.error);
      return result.doc;
    },

    /** Validates `data` as a design file, writes it canonically and regenerates `spec.md`. */
    async writeDesign(path: string, kind: DesignKind, data: unknown): Promise<void> {
      const dir = await resolveProjectDir(path);
      const result = parseDesign(kind, data);
      if (!result.ok) throw CoreError.invalidDesign(result.error);
      await requireDesignDir(dir);
      const text = stringifyDesign(kind, result.doc);
      watcher.noteWrite(dir, kind, text);
      await writeAtomic(designFile(dir, kind), text);
      await refreshSpec(dir);
      if (kind === 'config') {
        // Keep the picker in step with the header's inline rename.
        await recents.rename(dir, (result.doc as Config).name);
      }
    },

    /** The build record, read-only: the CLI writes it after a verified build, never modelwright. */
    async readBuildRecord(path: string): Promise<BuildRead> {
      return readBuildRecord(await resolveProjectDir(path));
    },

    /** Classifies a preview URL for the UI view. Reads no files; returns no response bodies. */
    checkPreview(url: string, { toolOrigin, framing = true }: PreviewCheckContext) {
      return checkPreview(url, { toolOrigin, toolPorts, timeoutMs: previewTimeoutMs, framing });
    },

    /**
     * Calls `onChange` whenever a design file (or `build.json`, as `'build'`) changes outside
     * modelwright. Resolves to the unsubscribe function once watching has started.
     */
    async watchDesign(path: string, onChange: DesignChangeListener): Promise<() => void> {
      const dir = await resolveProjectDir(path);
      await requireDesignDir(dir);
      return watcher.subscribe(dir, onChange);
    },
  };
}

export type Core = ReturnType<typeof createCore>;
export type { PreviewCheck };

/**
 * Regenerates `.design/spec.md` after a successful write. The design file is already saved, so
 * a failure here is logged rather than failing the call.
 */
async function refreshSpec(dir: string): Promise<void> {
  try {
    await regenerateSpec(dir);
  } catch (err) {
    console.error(`Couldn't write ${dir}/.design/spec.md`, err);
  }
}
