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
export const StartDevServerArgs = z.object({ path: z.string(), approve: z.boolean().optional() });
export const DesignKindArg = z.enum(DESIGN_KINDS);

const Rect = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

/**
 * The desktop preview as the renderer lays it out: where it sits in the window, which device
 * it emulates and at what scale. Only http(s) pages are ever loaded into it.
 */
export const PreviewLayout = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  /** Bumped by Reload preview: the page loads again. */
  reload: z.number().int().nonnegative(),
  /** The preview's screen, in window coordinates (CSS pixels), already scaled. */
  bounds: Rect,
  /** The viewport the page lays out in, before scaling. */
  viewport: z.strictObject({
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
  }),
  /** A phone: mobile user agent, touch and a high device scale factor. */
  mobile: z.boolean(),
  scale: z.number().positive().max(1),
  /** The screen's corner radius as drawn (scaled), so the page's corners match the frame. */
  radius: z.number().nonnegative().max(200),
  /** False while the UI view is hidden, or something modelwright shows covers the preview. */
  visible: z.boolean(),
});
export type PreviewLayout = z.infer<typeof PreviewLayout>;

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
  // The desktop host's own calls, beside ProjectClient's.
  chooseFolder: z.tuple([z.enum(['open', 'location']), z.string().optional()]),
  setHostState: z.tuple([
    z.strictObject({ projectOpen: z.boolean(), theme: z.enum(['system', 'light', 'dark']) }),
  ]),
  readyToClose: z.tuple([]),
  /** The preview's layout, or null to remove it. */
  setPreview: z.tuple([PreviewLayout.nullable()]),
  /** A picture of the preview as it is, to stand in for it while something covers it. */
  snapshotPreview: z.tuple([]),
  // The project's dev server. Start takes no command: the core reads it from config.json.
  devServerState: z.tuple([z.string()]),
  startDevServer: z.tuple([z.string(), z.boolean()]),
  stopDevServer: z.tuple([z.string()]),
  watchDevServer: z.tuple([z.string()]),
  unwatchDevServer: z.tuple([z.string()]),
} as const;
