import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { allows } from '../src/frameHeaders';

const WEB_ORIGIN = 'http://localhost:4300';
/** Every probe server's body contains this; it must never come back from the API. */
const SECRET = 'probe-body-6f1c2a';

const app = createApp({
  homeDir: path.join(os.tmpdir(), 'modelwright-preview-check-unused'),
  previewTimeoutMs: 300,
});

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

/** Starts a local server for one test and returns its base URL. */
async function serve(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A server answering every request with `status`, `headers` and a body holding SECRET. */
function respond(status: number, headers: http.OutgoingHttpHeaders = {}) {
  return serve((_req, res) => {
    res.writeHead(status, { 'content-type': 'text/html', ...headers });
    res.end(`<html><body>${SECRET}</body></html>`);
  });
}

/** Checks `url` through the API, as the web app would. */
async function check(url: string, origin = WEB_ORIGIN) {
  const res = await app.request('/api/preview/check', {
    method: 'POST',
    headers: { host: '127.0.0.1:4301', 'content-type': 'application/json', origin },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  expect(text).not.toContain(SECRET);
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown> };
}

async function expectCheck(url: string, status: string, detail?: RegExp) {
  const res = await check(url);
  expect(res.status).toBe(200);
  // Only the classification and a detail ever come back.
  expect(Object.keys(res.body).every((k) => k === 'status' || k === 'detail')).toBe(true);
  expect(res.body['status']).toBe(status);
  if (detail) expect(res.body['detail']).toMatch(detail);
  return res.body;
}

describe('POST /api/preview/check', () => {
  it('reports a plain 200 as ok', async () => {
    const body = await expectCheck(await respond(200), 'ok');
    expect(body).toEqual({ status: 'ok' });
  });

  it.each([404, 500])('reports a %i as ok: the dev server is running', async (status) => {
    await expectCheck(await respond(status), 'ok');
  });

  it('reports a closed port as unreachable', async () => {
    const url = await respond(200);
    await new Promise<void>((resolve) => {
      const server = servers.pop();
      if (server) server.close(() => resolve());
    });
    await expectCheck(url, 'unreachable', /Connection refused/);
  });

  it('reports a server that never responds as unreachable (timeout)', async () => {
    const url = await serve(() => {
      // Accept the connection and never answer.
    });
    await expectCheck(url, 'unreachable', /No response within 0.3 s/);
  });

  it('reports an unknown host as unreachable', async () => {
    await expectCheck('http://modelwright-no-such-host.invalid:5173', 'unreachable', /not found/);
  });

  it.each(['DENY', 'SAMEORIGIN', 'deny'])(
    'reports X-Frame-Options: %s as refusing embedding, naming the header',
    async (value) => {
      const url = await respond(200, { 'x-frame-options': value });
      await expectCheck(url, 'refuses-embedding', new RegExp(`X-Frame-Options: ${value}`, 'i'));
    },
  );

  it('ignores X-Frame-Options ALLOW-FROM, as browsers do', async () => {
    await expectCheck(await respond(200, { 'x-frame-options': 'ALLOW-FROM x' }), 'ok');
  });

  it("reports CSP frame-ancestors 'none' as refusing embedding", async () => {
    const url = await respond(200, {
      'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    });
    await expectCheck(url, 'refuses-embedding', /Content-Security-Policy: frame-ancestors 'none'/);
  });

  it("reports frame-ancestors 'self' as refusing: the preview is never the tool's origin", async () => {
    const url = await respond(200, { 'content-security-policy': "frame-ancestors 'self'" });
    await expectCheck(url, 'refuses-embedding', /'self'/);
  });

  it("reports a frame-ancestors that includes the web app's origin as ok", async () => {
    const url = await respond(200, {
      'content-security-policy': "frame-ancestors 'self' http://localhost:4300",
    });
    await expectCheck(url, 'ok');
  });

  it('lets frame-ancestors override X-Frame-Options, as browsers do', async () => {
    const url = await respond(200, {
      'content-security-policy': 'frame-ancestors http://localhost:*',
      'x-frame-options': 'DENY',
    });
    await expectCheck(url, 'ok');
  });

  it('ignores a report-only policy', async () => {
    const url = await respond(200, {
      'content-security-policy-report-only': "frame-ancestors 'none'",
    });
    await expectCheck(url, 'ok');
  });

  it('checks frame-ancestors against the origin the request came from', async () => {
    const url = await respond(200, {
      'content-security-policy': 'frame-ancestors http://localhost:4300',
    });
    expect((await check(url, 'http://127.0.0.1:4300')).body['status']).toBe('refuses-embedding');
  });

  describe('redirects', () => {
    /** A chain of `hops` redirects ending in `final`. */
    async function chain(hops: number, final: http.OutgoingHttpHeaders = {}) {
      const base = await serve((req, res) => {
        const n = Number(req.url?.slice(1) || 0);
        if (n < hops) {
          res.writeHead(302, { location: `/${n + 1}` });
          res.end(SECRET);
        } else {
          res.writeHead(200, final);
          res.end(SECRET);
        }
      });
      return `${base}/0`;
    }

    it('follows a chain within the limit', async () => {
      await expectCheck(await chain(5), 'ok');
    });

    it('reads the frame headers of the final response', async () => {
      await expectCheck(await chain(2, { 'x-frame-options': 'DENY' }), 'refuses-embedding');
    });

    it('gives up beyond the limit', async () => {
      await expectCheck(await chain(6), 'unreachable', /Too many redirects/);
    });

    it('refuses a redirect to the tool itself', async () => {
      const url = await serve((_req, res) => {
        res.writeHead(302, { location: 'http://127.0.0.1:4301/api/projects/recent' });
        res.end();
      });
      await expectCheck(url, 'invalid', /modelwright/);
    });
  });

  it.each(['ftp://localhost:21', 'file:///etc/passwd', '/relative', 'localhost:5173', 'not a url'])(
    'reports %j as invalid',
    async (url) => {
      await expectCheck(url, 'invalid');
    },
  );

  it.each(['http://127.0.0.1:4300', 'http://localhost:4301/api/health', 'http://[::1]:4300/'])(
    "reports the tool's own address %s as invalid",
    async (url) => {
      await expectCheck(url, 'invalid', /modelwright/);
    },
  );

  it('rejects a request without a url', async () => {
    const res = await app.request('/api/preview/check', {
      method: 'POST',
      headers: { host: '127.0.0.1:4301', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });

  it('still rejects foreign origins', async () => {
    const res = await check('http://localhost:5173', 'https://evil.example');
    expect(res.status).toBe(403);
  });
});

describe('frame-ancestors source matching', () => {
  const tool = new URL('http://localhost:4300');
  const resource = new URL('http://localhost:5173');
  it.each([
    ['*', true],
    ['http:', true],
    ['https:', false],
    ['http://localhost:4300', true],
    ['localhost:4300', true],
    ['http://localhost:*', true],
    ['http://localhost', false],
    ['http://localhost:4301', false],
    ['https://localhost:4300', false],
    ['*.localhost:4300', false],
    ['http://*.example.com', false],
    ["'none'", false],
    ["'none' http://localhost:4300", true],
    ["'self'", false],
    ["'nonce-abc'", false],
    ['', false],
  ])('%j allows the tool: %s', (sources, expected) => {
    expect(allows(sources, tool, resource)).toBe(expected);
  });

  it('matches a wildcard subdomain', () => {
    const sub = new URL('http://studio.dev.localhost:4300');
    expect(allows('http://*.localhost:4300', sub, resource)).toBe(true);
  });
});
