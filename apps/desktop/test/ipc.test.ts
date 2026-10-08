import { describe, expect, it, vi } from 'vitest';
import { INVOKE_METHODS, IPC_ARGS, type Core, type DesignChangeEvent } from '@modelwright/core';
import { createIpcHandlers } from '../src/main/ipc';
import { createDesktopApi, type RendererChannel } from '../src/preload/api';

const TRUSTED = 'app://modelwright/index.html';

/** A core whose every method is a spy, so a test can see that nothing reached it. */
function spyCore() {
  const unwatch = vi.fn();
  const core = {
    resolveProjectDir: vi.fn(),
    openProject: vi.fn(async () => ({ ok: 'opened' })),
    initProject: vi.fn(async () => ({})),
    createProject: vi.fn(async () => ({})),
    listRecent: vi.fn(async () => []),
    removeRecent: vi.fn(async () => {}),
    readDesign: vi.fn(async () => ({})),
    writeDesign: vi.fn(async () => {}),
    readBuildRecord: vi.fn(async () => ({ status: 'none' })),
    checkPreview: vi.fn(async () => ({ status: 'ok' })),
    watchDesign: vi.fn(async () => unwatch),
  };
  return { core, unwatch, asCore: core as unknown as Core };
}

function setup() {
  const spies = spyCore();
  const handlers = createIpcHandlers(spies.asCore, {
    isTrusted: (url) => url.startsWith('app://modelwright/'),
    toolOrigin: 'app://modelwright',
  });
  const sender = (id = 1, url = TRUSTED) => ({ id, url, send: vi.fn() });
  const coreCalls = () => Object.values(spies.core).reduce((n, fn) => n + fn.mock.calls.length, 0);
  return { ...spies, handlers, sender, coreCalls };
}

describe('IPC argument validation', () => {
  const malformed: [string, unknown[]][] = [
    ['openProject', []],
    ['openProject', [42]],
    ['openProject', ['/a', 'extra']],
    ['initProject', ['/a', 7]],
    ['createProject', ['/a', 'name']],
    ['createProject', ['/a', 'name', 'yes']],
    ['listRecent', ['unexpected']],
    ['removeRecent', [null]],
    ['readDesign', ['/a', 'spec']],
    ['readDesign', ['/a', '../erd']],
    ['writeDesign', ['/a', 'build', {}]],
    ['readBuildRecord', [{ path: '/a' }]],
    ['checkPreview', [['http://x']]],
    ['watchDesign', [undefined]],
    ['unwatchDesign', [1]],
  ];

  it.each(malformed)('rejects %s(%j) before it reaches the core', async (method, args) => {
    const { handlers, sender, coreCalls } = setup();
    const result = await handlers.handle(method as never, sender(), args);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-argument' } });
    expect(coreCalls()).toBe(0);
  });

  it('passes well-formed arguments through', async () => {
    const { handlers, sender, core } = setup();
    expect(await handlers.handle('openProject', sender(), ['/a'])).toEqual({
      ok: true,
      value: { ok: 'opened' },
    });
    expect(core.openProject).toHaveBeenCalledWith('/a');
  });

  it('refuses calls from any page but modelwright’s own', async () => {
    const { handlers, sender, coreCalls } = setup();
    for (const url of ['https://evil.example/', 'app://other/index.html', '', 'file:///x']) {
      const result = await handlers.handle('listRecent', sender(1, url), []);
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-argument' } });
    }
    expect(coreCalls()).toBe(0);
  });

  it('checks previews as a top-level page, so frame headers don’t count', async () => {
    const { handlers, sender, core } = setup();
    await handlers.handle('checkPreview', sender(), ['http://localhost:5173']);
    expect(core.checkPreview).toHaveBeenCalledWith('http://localhost:5173', {
      toolOrigin: 'app://modelwright',
      framing: false,
    });
  });

  it('reports an unexpected failure as an internal error value, not a throw', async () => {
    const { handlers, sender, core } = setup();
    core.listRecent.mockRejectedValueOnce(new Error('disk on fire'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    expect(await handlers.handle('listRecent', sender(), [])).toEqual({
      ok: false,
      error: { code: 'internal', message: 'disk on fire' },
    });
  });

  it('has a schema for every method', () => {
    expect(Object.keys(IPC_ARGS).sort()).toEqual([...INVOKE_METHODS].sort());
  });
});

describe('watches', () => {
  it('belong to their renderer: another can’t stop them, and releasing the renderer does', async () => {
    const { handlers, sender, unwatch } = setup();
    const owner = sender(1);
    const result = await handlers.handle('watchDesign', owner, ['/a']);
    if (!result.ok) throw new Error('watch failed');
    await handlers.handle('unwatchDesign', sender(2), [result.value]);
    expect(unwatch).not.toHaveBeenCalled();
    handlers.releaseSender(1);
    expect(unwatch).toHaveBeenCalledOnce();
    expect(handlers.activeWatches()).toBe(0);
  });
});

describe('the preload API', () => {
  function channel() {
    const invoke = vi.fn<RendererChannel['invoke']>(async () => ({ ok: true, value: 'w1' }));
    const listeners: ((event: unknown, change: DesignChangeEvent) => void)[] = [];
    const ipc: RendererChannel = { invoke, on: (_, l) => listeners.push(l) };
    return {
      ipc,
      invoke,
      emit: (change: DesignChangeEvent) => listeners.forEach((l) => l({}, change)),
    };
  }

  it('forwards only known methods', async () => {
    const { ipc, invoke } = channel();
    const api = createDesktopApi(ipc);
    expect(await api.invoke('nope' as never)).toMatchObject({ ok: false });
    expect(invoke).not.toHaveBeenCalled();
    await api.invoke('listRecent');
    expect(invoke).toHaveBeenCalledWith('mw:listRecent');
  });

  it('delivers changes to the right watch, and unwatches a watch stopped before it started', async () => {
    const { ipc, invoke, emit } = channel();
    const api = createDesktopApi(ipc);
    const seen: string[] = [];
    api.watchDesign('/a', (kind) => seen.push(kind));
    await Promise.resolve();
    await Promise.resolve();
    emit({ id: 'w1', kind: 'erd' });
    emit({ id: 'other', kind: 'flows' });
    expect(seen).toEqual(['erd']);

    const stop = api.watchDesign('/b', () => {});
    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenLastCalledWith('mw:unwatchDesign', 'w1');
  });
});
