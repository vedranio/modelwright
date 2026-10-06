import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { readTextOrNull, writeAtomic } from '@modelwright/project/node';

export const RECENTS_LIMIT = 20;

const RecentEntry = z.object({
  path: z.string(),
  name: z.string(),
  /** ISO timestamp of the last open. Entries written before phase 2 have none. */
  lastOpenedAt: z.string().optional(),
});
export type RecentEntry = z.infer<typeof RecentEntry>;
const RecentsFile = z.object({ projects: z.array(RecentEntry) });

/**
 * The recently opened projects, most recent first, stored in modelwright's own home directory.
 * Updates are serialised so concurrent requests can't lose each other's changes.
 */
export class Recents {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(
    private readonly homeDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = path.join(homeDir, 'recents.json');
  }

  list(): Promise<RecentEntry[]> {
    return this.serialise(() => this.read());
  }

  /** Adds or moves a project to the top, refreshing its name and stamping it as opened now. */
  async add(entry: { path: string; name: string }): Promise<RecentEntry> {
    const stamped = { ...entry, lastOpenedAt: this.now().toISOString() };
    await this.update((list) =>
      [stamped, ...list.filter((e) => e.path !== entry.path)].slice(0, RECENTS_LIMIT),
    );
    return stamped;
  }

  remove(projectPath: string): Promise<void> {
    return this.update((list) => list.filter((e) => e.path !== projectPath));
  }

  /** Updates a project's name in place without changing its position. No-op if it isn't listed. */
  rename(projectPath: string, name: string): Promise<void> {
    return this.update((list) => list.map((e) => (e.path === projectPath ? { ...e, name } : e)));
  }

  private update(change: (list: RecentEntry[]) => RecentEntry[]): Promise<void> {
    return this.serialise(async () => {
      const next = change(await this.read());
      await fs.mkdir(this.homeDir, { recursive: true });
      await writeAtomic(this.file, `${JSON.stringify({ projects: next }, null, 2)}\n`);
    });
  }

  /** A missing or corrupt recents file is treated as empty rather than breaking the picker. */
  private async read(): Promise<RecentEntry[]> {
    const text = await readTextOrNull(this.file);
    if (text === null) return [];
    try {
      const parsed = RecentsFile.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data.projects : [];
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
