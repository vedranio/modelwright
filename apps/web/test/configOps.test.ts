import { describe, expect, it } from 'vitest';
import { Config } from '@modelwright/schema';
import { renameProject, setPreviewUrl } from '../src/config/ops';
import { deepFreeze } from './helpers';

const full = (): Config =>
  deepFreeze({
    schemaVersion: 1,
    name: 'Notes',
    preview: { url: 'http://localhost:5173', devCommand: 'pnpm dev' },
    devices: [
      { id: 'phone', name: 'Phone', width: 375, height: 667 },
      { id: 'wide', name: 'Wide', width: 1440 },
    ],
  });

const bare = (): Config => deepFreeze({ schemaVersion: 1, name: 'Bare', preview: {} });

/** Every op result must still be a valid config. */
function valid(config: Config): Config {
  const result = Config.safeParse(config);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return config;
}

describe('renameProject', () => {
  it('renames, keeping everything else', () => {
    const before = full();
    const after = valid(renameProject(before, 'Notebook'));
    expect(after).toEqual({ ...before, name: 'Notebook' });
    expect(after.preview).toBe(before.preview);
    expect(after.devices).toBe(before.devices);
  });

  it('returns the same object for an unchanged name', () => {
    const before = full();
    expect(renameProject(before, 'Notes')).toBe(before);
  });

  it.each(['', '   '])('refuses the blank name %j', (name) => {
    const before = full();
    expect(renameProject(before, name)).toBe(before);
  });
});

describe('setPreviewUrl', () => {
  it('sets a URL where there was none', () => {
    const before = bare();
    expect(valid(setPreviewUrl(before, 'http://localhost:3000'))).toEqual({
      ...before,
      preview: { url: 'http://localhost:3000' },
    });
  });

  it('replaces a URL, keeping devCommand and devices', () => {
    const before = full();
    const after = valid(setPreviewUrl(before, 'http://localhost:3000'));
    expect(after.preview).toEqual({ url: 'http://localhost:3000', devCommand: 'pnpm dev' });
    expect(after.devices).toBe(before.devices);
    expect(after.name).toBe('Notes');
  });

  it('returns the same object for an unchanged URL', () => {
    const before = full();
    expect(setPreviewUrl(before, 'http://localhost:5173')).toBe(before);
  });

  it.each(['', '  '])('removes the key for the blank value %j', (url) => {
    const before = full();
    const after = valid(setPreviewUrl(before, url));
    expect(after.preview).toEqual({ devCommand: 'pnpm dev' });
    expect('url' in after.preview).toBe(false);
    expect(after.devices).toBe(before.devices);
  });

  it('returns the same object when clearing a URL that isn’t set', () => {
    const before = bare();
    expect(setPreviewUrl(before, '')).toBe(before);
  });
});
