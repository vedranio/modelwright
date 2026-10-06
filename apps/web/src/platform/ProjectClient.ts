import type {
  DesignDoc,
  DesignKind,
  Issue,
  PreviewCheck,
  ProjectSummary,
} from '@modelwright/schema';

export type { DesignDoc, DesignKind, PreviewCheck, ProjectSummary };

/**
 * Everything the UI needs from disk. The web build talks HTTP to apps/server; Electron will
 * provide an IPC implementation of the same interface. Components depend on this, never on
 * fetch, Node APIs or server URLs.
 */
export interface ProjectClient {
  openProject(path: string): Promise<ProjectSummary>;
  initProject(path: string, name?: string): Promise<ProjectSummary>;
  listRecent(): Promise<ProjectSummary[]>;
  removeRecent(path: string): Promise<void>;
  readDesign<K extends DesignKind>(path: string, file: K): Promise<DesignDoc<K>>;
  writeDesign<K extends DesignKind>(path: string, file: K, doc: DesignDoc<K>): Promise<void>;
  /**
   * Whether a preview URL can be shown in an iframe: reachable, and not refusing to be framed.
   * A browser can't see why a cross-origin iframe is blank, so the host process finds out.
   */
  checkPreview(url: string): Promise<PreviewCheck>;
  /**
   * Calls `onChange` whenever one of the project's design files changes on disk, other than
   * by this client's own writes. Returns a function that stops watching.
   */
  watchDesign(path: string, onChange: (change: DesignChange) => void): () => void;
}

/** A design file changed on disk, outside modelwright. */
export interface DesignChange {
  kind: DesignKind;
}

/** A failed ProjectClient call. `issues` is set when a design file failed validation. */
export class ProjectClientError extends Error {
  constructor(
    message: string,
    /** HTTP-style status: 404 missing, 409 conflict, 422 invalid file, 0 unreachable. */
    readonly status: number,
    readonly issues?: Issue[],
  ) {
    super(message);
    this.name = 'ProjectClientError';
  }
}
