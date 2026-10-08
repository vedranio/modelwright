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
