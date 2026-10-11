import type { BuildRecord } from './build';
import type { Issue } from './common';

/**
 * Shapes exchanged between the server and ProjectClient. Not part of the `.design/` file contract:
 * these can change without a schemaVersion bump.
 */

/** A project folder as the picker and shell see it. */
export interface ProjectSummary {
  /** Absolute, normalised path to the project folder. */
  path: string;
  /** `path` with the user's home directory shown as `~`. Computed by the server, which knows home. */
  displayPath: string;
  /** The `config.json` name when it parses, otherwise the folder name. */
  name: string;
  /** Whether `.design/` exists with all three files. */
  initialised: boolean;
  /** ISO timestamp of the last successful open. Absent for recents written before it was recorded. */
  lastOpenedAt?: string;
  /** Set on the demo project modelwright ships, in recents listings. */
  demo?: boolean;
}

/** Body of every non-validation error response (validation errors use `DesignError`). */
export interface ApiErrorBody {
  message: string;
}

/**
 * Whether a preview URL can be shown in the tool's iframe, as the server found it. Only a
 * classification and a short detail: never anything from the response body.
 */
export interface PreviewCheck {
  status: 'ok' | 'unreachable' | 'refuses-embedding' | 'invalid';
  /** What happened, e.g. "Connection refused" or "X-Frame-Options: DENY". */
  detail?: string;
}

/** `.design/build.json` as read: absent, a valid record, or why it isn't one. */
export type BuildRead =
  | { status: 'none' }
  | { status: 'ok'; record: BuildRecord }
  | { status: 'invalid'; issues: Issue[] };

/**
 * A project's dev server as modelwright started it. `running` only means the process is alive;
 * whether the preview URL answers is the preview check's business.
 */
export interface DevServerState {
  status: 'idle' | 'running' | 'exited';
  /** The command it runs (or ran), from `config.json`'s `preview.devCommand`. */
  command?: string;
  pid?: number;
  /** ISO timestamp. */
  startedAt?: string;
  /** Set once it has exited: the exit code, or the signal that ended it. */
  exitCode?: number | null;
  signal?: string | null;
  /** Why it couldn't start at all, e.g. the shell wasn't found. */
  error?: string;
}

/** What a dev server watcher hears: a snapshot first, then changes and new output lines. */
export type DevServerEvent =
  | { type: 'snapshot'; state: DevServerState; lines: string[] }
  | { type: 'state'; state: DevServerState }
  | { type: 'output'; lines: string[] };

/**
 * Starting a dev server: it runs only once its exact command has been approved for the
 * project. Until then, start says what it would run, and where, and runs nothing.
 */
export type StartDevServerResult =
  | { status: 'needs-approval'; command: string; cwd: string }
  | { status: 'started'; state: DevServerState };
