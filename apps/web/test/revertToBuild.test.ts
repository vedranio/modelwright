import { describe, expect, it } from 'vitest';
import { Config, Erd, Flows } from '@modelwright/schema';
import { diffDesign, changeCount } from '@modelwright/spec';
import { revertToBuild } from '../src/buildRecord/revert';
import { addScreen, renameScreen, retargetTransition } from '../src/flows/ops';
import { notesErd, notesFlows } from './fixtures';
import { deepFreeze } from './helpers';

const config = (): Config => ({
  schemaVersion: 1,
  name: 'Notes',
  preview: { url: 'http://localhost:5173', devCommand: 'pnpm dev' },
});

function snapshot() {
  return deepFreeze({ config: config(), erd: notesErd(), flows: notesFlows() });
}

describe('revertToBuild', () => {
  it('undoes every change since the build', () => {
    const built = snapshot();
    let flows = renameScreen(notesFlows(), 'notes', 'All notes');
    flows = retargetTransition(flows, 't2', { screenId: 'login' });
    flows = addScreen(flows, { x: 900, y: 0 }).flows;
    const erd: Erd = { ...notesErd(), entities: notesErd().entities.slice(1) };
    erd.relationships = [];
    erd.layout = Object.fromEntries(
      Object.entries(erd.layout).filter(([id]) => erd.entities.some((e) => e.id === id)),
    );
    const now = { config: { ...config(), name: 'Renamed' }, erd, flows };
    expect(changeCount(diffDesign(built, now))).toBeGreaterThan(0);

    const reverted = revertToBuild(now, built);
    expect(Flows.safeParse(reverted.flows).success).toBe(true);
    expect(Erd.safeParse(reverted.erd).success).toBe(true);
    expect(Config.safeParse(reverted.config).success).toBe(true);
    expect(changeCount(diffDesign(built, reverted))).toBe(0);
  });

  it('keeps cards where they are now, and puts back removed ones where they were', () => {
    const built = snapshot();
    const moved = {
      ...notesFlows(),
      layout: { ...notesFlows().layout, login: { x: -500, y: 40 } },
    };
    const flows = {
      ...moved,
      screens: moved.screens.filter((s) => s.id !== 'editor'),
      transitions: [],
    };
    delete (flows.layout as Record<string, unknown>)['editor'];
    const reverted = revertToBuild({ ...built, flows }, built);
    expect(reverted.flows.layout['login']).toEqual({ x: -500, y: 40 });
    expect(reverted.flows.layout['editor']).toEqual(built.flows.layout['editor']);
  });

  it('keeps config the diff doesn’t compare, and returns unchanged documents as they are', () => {
    const built = snapshot();
    const now = {
      config: { ...config(), preview: { devCommand: 'npm run dev' } },
      erd: notesErd(),
      flows: notesFlows(),
    };
    const reverted = revertToBuild(now, built);
    expect(reverted.config.preview).toEqual({
      url: 'http://localhost:5173',
      devCommand: 'npm run dev',
    });
    expect(reverted.erd).toBe(now.erd);
    expect(reverted.flows).toBe(now.flows);
  });
});
