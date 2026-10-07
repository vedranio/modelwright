import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESIGN_KINDS, parseDesignJson, stringifyDesign } from '@modelwright/schema';
import { createApp } from '../src/app';
import { DEMO_TEMPLATE, demoDir } from '../src/demo';
import { json, useSandbox } from './helpers';

const sb = useSandbox();

/** An app over the sandbox home that offers the demo, as the real server does. */
function appWithDemo() {
  return createApp({ homeDir: sb.home, userHome: sb.root, demoTemplate: DEMO_TEMPLATE });
}

async function recents(app: ReturnType<typeof createApp>) {
  const res = await app.request('/api/projects/recent', { headers: { host: '127.0.0.1:4301' } });
  return json(res);
}

describe('the demo template', () => {
  it.each(DESIGN_KINDS)('has a valid, canonical %s.json', async (kind) => {
    const text = await readFile(path.join(DEMO_TEMPLATE, '.design', `${kind}.json`), 'utf8');
    const result = parseDesignJson(kind, text);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(stringifyDesign(kind, result.doc)).toBe(text);
  });

  it('makes sense: every action leads somewhere, every screen is reachable and has a primary action', async () => {
    const read = async (kind: 'erd' | 'flows') => {
      const result = parseDesignJson(
        kind,
        await readFile(path.join(DEMO_TEMPLATE, '.design', `${kind}.json`), 'utf8'),
      );
      if (!result.ok) throw new Error(kind);
      return result.doc;
    };
    const flows = (await read('flows')) as Awaited<ReturnType<typeof read>> & {
      screens: {
        id: string;
        entities?: string[];
        states: { id: string; primaryCtaId?: string; ctas: { id: string }[] }[];
      }[];
      transitions: {
        from: { screenId: string; stateId: string; ctaId: string };
        to: { screenId: string };
      }[];
    };
    const erd = (await read('erd')) as { entities: { id: string }[] };
    const entityIds = new Set(erd.entities.map((e) => e.id));
    for (const screen of flows.screens) {
      for (const id of screen.entities ?? []) expect(entityIds.has(id)).toBe(true);
      for (const state of screen.states) {
        expect(state.primaryCtaId, `${screen.id} › ${state.id} has a primary action`).toBeDefined();
        for (const cta of state.ctas) {
          const leads = flows.transitions.some(
            (t) =>
              t.from.screenId === screen.id &&
              t.from.stateId === state.id &&
              t.from.ctaId === cta.id,
          );
          expect(leads, `${screen.id} › ${state.id} › ${cta.id} leads somewhere`).toBe(true);
        }
      }
    }
    const [first, ...rest] = flows.screens;
    for (const screen of rest) {
      expect(
        flows.transitions.some((t) => t.to.screenId === screen.id),
        `${screen.id} is reachable`,
      ).toBe(true);
    }
    expect(first?.id).toBe('lists');
  });
});

describe('offering the demo', () => {
  it('copies the demo into modelwright’s home and lists it, flagged, on a fresh install', async () => {
    const app = appWithDemo();
    const list = await recents(app);
    expect(list).toEqual([
      expect.objectContaining({
        path: demoDir(sb.home),
        name: 'Todo',
        initialised: true,
        demo: true,
      }),
    ]);
    expect((await readdir(path.join(demoDir(sb.home), '.design'))).sort()).toEqual([
      'config.json',
      'erd.json',
      'flows.json',
      'spec.md',
    ]);
  });

  it('adds it after an existing install’s own projects, without pushing them down', async () => {
    const mine = await sb.notesProject('mine');
    await sb.call('POST', '/api/projects/open', { path: mine });
    const list = await recents(appWithDemo());
    expect(list.map((r: { path: string }) => r.path)).toEqual([mine, demoDir(sb.home)]);
    expect(list[0].demo).toBeUndefined();
  });

  it('never offers it again once dismissed, even after a restart', async () => {
    const app = appWithDemo();
    await recents(app);
    await app.request('/api/projects/recent', {
      method: 'DELETE',
      headers: { host: '127.0.0.1:4301', 'content-type': 'application/json' },
      body: JSON.stringify({ path: demoDir(sb.home) }),
    });
    expect(await recents(appWithDemo())).toEqual([]);
  });

  it('keeps an existing copy of the demo, edits included', async () => {
    const app = appWithDemo();
    await recents(app);
    const config = path.join(demoDir(sb.home), '.design', 'config.json');
    const edited = (await readFile(config, 'utf8')).replace('"Todo"', '"My todo"');
    await writeFile(config, edited);
    await rm(path.join(sb.home, 'demo-offered'));
    await recents(appWithDemo());
    expect(await readFile(config, 'utf8')).toBe(edited);
  });

  it('is off without a template (as in the other tests)', async () => {
    expect(await json(await sb.call('GET', '/api/projects/recent'))).toEqual([]);
  });
});
