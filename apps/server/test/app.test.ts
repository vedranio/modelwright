import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('server app', () => {
  it('responds to the health check', async () => {
    const res = await createApp().request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
