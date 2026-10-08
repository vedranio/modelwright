import { z } from 'zod';
import { DESIGN_KINDS, type DesignError } from '@modelwright/schema';

/**
 * What the core's transports share: argument schemas, error codes and their wire forms. Pure
 * (zod and types only), so the web app's clients can import it without pulling in Node.
 */

/** Why a core call failed. Each transport maps these onto its own wire format. */
export type CoreErrorCode =
  | 'invalid-argument'
  | 'not-found'
  | 'conflict'
  | 'invalid-design'
  /** Anything unexpected, reported by a transport rather than thrown by the core. */
  | 'internal';

/** A core error as it crosses a transport boundary. */
export interface SerialisedError {
  code: CoreErrorCode;
  message: string;
  /** Set for `invalid-design`: the file and its problems. */
  design?: DesignError;
}

/** The HTTP status each code maps to. `ProjectClientError.status` uses the same numbers. */
export const STATUS_FOR_CODE: Record<CoreErrorCode, 400 | 404 | 409 | 422 | 500> = {
  'invalid-argument': 400,
  'not-found': 404,
  conflict: 409,
  'invalid-design': 422,
  internal: 500,
};

// Argument schemas, shared by the HTTP adapter's bodies and the IPC handlers' arguments.
export const PathArgs = z.object({ path: z.string() });
export const InitArgs = z.object({ path: z.string(), name: z.string().optional() });
export const CreateArgs = z.object({
  parent: z.string(),
  name: z.string(),
  git: z.boolean().optional(),
});
export const PreviewArgs = z.object({ url: z.string() });
export const DesignKindArg = z.enum(DESIGN_KINDS);

/** Each IPC method's arguments, as the tuple the preload sends. Validated in main before any handler runs. */
export const IPC_ARGS = {
  openProject: z.tuple([z.string()]),
  initProject: z.tuple([z.string(), z.string().optional()]),
  createProject: z.tuple([z.string(), z.string(), z.boolean()]),
  listRecent: z.tuple([]),
  removeRecent: z.tuple([z.string()]),
  readDesign: z.tuple([z.string(), DesignKindArg]),
  writeDesign: z.tuple([z.string(), DesignKindArg, z.unknown()]),
  readBuildRecord: z.tuple([z.string()]),
  checkPreview: z.tuple([z.string()]),
  watchDesign: z.tuple([z.string()]),
  unwatchDesign: z.tuple([z.string()]),
} as const;
