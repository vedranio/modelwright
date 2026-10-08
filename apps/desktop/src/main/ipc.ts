import { randomUUID } from 'node:crypto';
import {
  CoreError,
  DESIGN_CHANGE_CHANNEL,
  IPC_ARGS,
  type Core,
  type DesignChangeEvent,
  type InvokeMethod,
  type IpcResult,
  type SerialisedError,
} from '@modelwright/core';

/** The renderer that sent an IPC call, as far as the handlers need to know it. */
export interface IpcSender {
  /** Stable per renderer (webContents id): watches belong to it. */
  id: number;
  /** The sending frame's URL, which must be modelwright's own page. */
  url: string;
  send(channel: string, payload: DesignChangeEvent): void;
}

export interface IpcHandlerOptions {
  /** Whether a frame URL is modelwright's own renderer. Anything else is refused. */
  isTrusted(url: string): boolean;
  /** The renderer's origin, which a preview URL may not be. */
  toolOrigin: string;
}

/**
 * The main process's side of every ProjectClient method. Each call is checked (the sender is
 * modelwright's own page, the arguments match the method's schema) before the core sees it,
 * and every outcome is a value: `{ ok, value }` or a serialised error. No project logic here.
 */
export function createIpcHandlers(core: Core, { isTrusted, toolOrigin }: IpcHandlerOptions) {
  /** Active watches by id, with the renderer that owns each. */
  const watches = new Map<string, { owner: number; stop: () => void }>();

  const methods: {
    [M in InvokeMethod]: (sender: IpcSender, ...args: never[]) => Promise<unknown>;
  } = {
    openProject: (_, path: string) => core.openProject(path),
    initProject: (_, path: string, name?: string) => core.initProject(path, name),
    createProject: (_, parent: string, name: string, git: boolean) =>
      core.createProject(parent, name, git),
    listRecent: () => core.listRecent(),
    removeRecent: (_, path: string) => core.removeRecent(path),
    readDesign: (_, path: string, kind: 'erd' | 'flows' | 'config') => core.readDesign(path, kind),
    writeDesign: (_, path: string, kind: 'erd' | 'flows' | 'config', doc: unknown) =>
      core.writeDesign(path, kind, doc),
    readBuildRecord: (_, path: string) => core.readBuildRecord(path),
    // The preview is a top-level page in the desktop app, so frame headers don't apply.
    checkPreview: (_, url: string) => core.checkPreview(url, { toolOrigin, framing: false }),
    async watchDesign(sender, path: string) {
      const id = randomUUID();
      const stop = await core.watchDesign(path, (kind) =>
        sender.send(DESIGN_CHANGE_CHANNEL, { id, kind }),
      );
      watches.set(id, { owner: sender.id, stop });
      return id;
    },
    async unwatchDesign(sender, id: string) {
      const watch = watches.get(id);
      if (watch?.owner !== sender.id) return;
      watches.delete(id);
      watch.stop();
    },
  };

  return {
    methods: Object.keys(methods) as InvokeMethod[],

    async handle(
      method: InvokeMethod,
      sender: IpcSender,
      args: unknown[],
    ): Promise<IpcResult<unknown>> {
      if (!isTrusted(sender.url)) {
        return failure({
          code: 'invalid-argument',
          message: 'Calls are only accepted from modelwright',
        });
      }
      const parsed = IPC_ARGS[method].safeParse(args);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const where = first?.path.length ? ` at ${first.path.join('.')}` : '';
        return failure({
          code: 'invalid-argument',
          message: `Invalid arguments for ${method}${where}: ${first?.message ?? 'unknown'}`,
        });
      }
      try {
        const handler = methods[method] as (sender: IpcSender, ...a: unknown[]) => Promise<unknown>;
        return { ok: true, value: await handler(sender, ...(parsed.data as unknown[])) };
      } catch (err) {
        if (err instanceof CoreError) return failure(err.toJSON());
        console.error(err);
        return failure({
          code: 'internal',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },

    /** Stops every watch a renderer holds, when it goes away. */
    releaseSender(senderId: number): void {
      for (const [id, watch] of watches) {
        if (watch.owner !== senderId) continue;
        watches.delete(id);
        watch.stop();
      }
    },

    /** How many watches are active, for tests. */
    activeWatches: () => watches.size,
  };
}

export type IpcHandlers = ReturnType<typeof createIpcHandlers>;

function failure(error: SerialisedError): IpcResult<never> {
  return { ok: false, error };
}
