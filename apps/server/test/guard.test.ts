import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { useSandbox } from './helpers';

const sb = useSandbox();

describe('origin guard', () => {
  it('rejects a write from a foreign origin and touches nothing', async () => {
    const dir = await sb.emptyProject();
    const res = await sb.call(
      'POST',
      '/api/projects/init',
      { path: dir },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
    expect(await readdir(dir)).toEqual([]);
  });

  it('rejects a foreign Host (DNS rebinding)', async () => {
    const res = await sb.call('GET', '/api/projects/recent', undefined, {
      host: 'evil.example:4301',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a request with no Host', async () => {
    const res = await sb.app.request('/api/projects/recent');
    expect(res.status).toBe(403);
  });

  it.each(['http://127.0.0.1:4300', 'http://localhost:4300'])(
    'allows the web app at %s',
    async (origin) => {
      const res = await sb.call('GET', '/api/projects/recent', undefined, {
        host: '127.0.0.1:4300',
        origin,
      });
      expect(res.status).toBe(200);
    },
  );

  it('allows non-browser clients that send no Origin', async () => {
    const res = await sb.call('GET', '/api/health');
    expect(res.status).toBe(200);
  });

  it('rejects the server port as an origin (only the web app may call)', async () => {
    const res = await sb.call('GET', '/api/health', undefined, {
      origin: 'http://127.0.0.1:4301',
    });
    expect(res.status).toBe(403);
  });
});
