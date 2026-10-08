import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { DESIGN_KINDS, isDesignKind, type DesignKind } from '@modelwright/schema';
import { readTextOrNull } from '@modelwright/project/node';
import { BUILD_FILE, buildFile, designDir, designFile } from './paths';

/** Editors save in several steps (temp file, rename, chmod); one change is reported after this. */
export const WATCH_DEBOUNCE_MS = 150;

/** A watched file: one of the three design files, or `build.json`. */
export type WatchedKind = DesignKind | 'build';

const WATCHED_KINDS: readonly WatchedKind[] = [...DESIGN_KINDS, 'build'];

export type DesignChangeListener = (kind: WatchedKind) => void;

function watchedKind(filename: string): WatchedKind | null {
  if (filename === BUILD_FILE) return 'build';
  const base = path.basename(filename, '.json');
  return `${base}.json` === filename && isDesignKind(base) ? base : null;
}

function watchedFile(projectDir: string, kind: WatchedKind): string {
  return kind === 'build' ? buildFile(projectDir) : designFile(projectDir, kind);
}

interface ProjectWatch {
  watcher: FSWatcher;
  listeners: Set<DesignChangeListener>;
  timers: Map<WatchedKind, ReturnType<typeof setTimeout>>;
  /** Each file's content as last reported (or as found when watching began). */
  seen: Map<WatchedKind, string | null>;
}

/**
 * Watches the three design files and `build.json` of each open project and reports changes
 * made outside modelwright (`build.json` is only ever written by the CLI). One fs watcher per project, shared by its subscribers and closed when the last
 * one leaves. A change is reported only when a file's content differs both from what the
 * server itself last wrote there and from what was last reported, so the server's own saves
 * never echo back, whatever the timing. `spec.md` and every other file are ignored.
 */
export class DesignWatcher {
  private readonly projects = new Map<string, ProjectWatch>();
  /** What the server last wrote to each design file, by absolute path. */
  private readonly written = new Map<string, string>();

  constructor(private readonly debounceMs = WATCH_DEBOUNCE_MS) {}

  /**
   * Records that the server is writing `text` to a design file, so the change it causes isn't
   * reported. Call it before the write, so even an early fs event finds it.
   */
  noteWrite(projectDir: string, kind: DesignKind, text: string): void {
    this.written.set(designFile(projectDir, kind), text);
    this.projects.get(projectDir)?.seen.set(kind, text);
  }

  /**
   * Calls `listener` with the kind of each design file changed outside modelwright. Resolves
   * to the unsubscribe function once watching has started.
   */
  async subscribe(projectDir: string, listener: DesignChangeListener): Promise<() => void> {
    let project = this.projects.get(projectDir);
    if (!project) {
      project = await this.start(projectDir);
      // Another subscriber may have started it while this one read the files.
      const raced = this.projects.get(projectDir);
      if (raced) {
        project.watcher.close();
        project = raced;
      } else {
        this.projects.set(projectDir, project);
      }
    }
    const active = project;
    active.listeners.add(listener);
    return () => {
      active.listeners.delete(listener);
      if (active.listeners.size === 0 && this.projects.get(projectDir) === active) {
        this.stop(projectDir, active);
      }
    };
  }

  /** How many projects are being watched (for tests). */
  get watching(): number {
    return this.projects.size;
  }

  /** Stops every watcher. */
  close(): void {
    for (const [dir, project] of this.projects) this.stop(dir, project);
  }

  private async start(projectDir: string): Promise<ProjectWatch> {
    const seen = new Map<WatchedKind, string | null>();
    await Promise.all(
      WATCHED_KINDS.map(async (kind) => {
        seen.set(kind, await readTextOrNull(watchedFile(projectDir, kind)));
      }),
    );
    const project: ProjectWatch = {
      watcher: watch(designDir(projectDir)),
      listeners: new Set(),
      timers: new Map(),
      seen,
    };
    project.watcher.on('change', (_event, filename) => {
      const name = typeof filename === 'string' ? filename : filename?.toString();
      if (!name) return;
      const kind = watchedKind(path.basename(name));
      if (!kind) return;
      clearTimeout(project.timers.get(kind));
      project.timers.set(
        kind,
        setTimeout(() => void this.check(projectDir, project, kind), this.debounceMs),
      );
    });
    // The folder went away or can't be watched any more: stop quietly; focus re-reads remain.
    project.watcher.on('error', () => this.stop(projectDir, project));
    return project;
  }

  private async check(projectDir: string, project: ProjectWatch, kind: WatchedKind) {
    project.timers.delete(kind);
    const file = watchedFile(projectDir, kind);
    const text = await readTextOrNull(file);
    if (text === project.seen.get(kind) || (text !== null && text === this.written.get(file))) {
      project.seen.set(kind, text);
      return;
    }
    project.seen.set(kind, text);
    for (const listener of project.listeners) listener(kind);
  }

  private stop(projectDir: string, project: ProjectWatch) {
    for (const timer of project.timers.values()) clearTimeout(timer);
    project.timers.clear();
    project.watcher.close();
    if (this.projects.get(projectDir) === project) this.projects.delete(projectDir);
  }
}
