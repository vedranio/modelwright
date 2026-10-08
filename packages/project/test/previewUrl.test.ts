import { describe, expect, it } from 'vitest';
import {
  PROBLEMS,
  TOOL_PORTS,
  checkPreviewUrl,
  isLoopback,
  normalizePreviewUrl,
} from '../src/rules/url';

const rules = { toolOrigin: 'http://127.0.0.1:4300', toolPorts: TOOL_PORTS };
const normalize = (input: string) => normalizePreviewUrl(input, rules);
const check = (input: string) => checkPreviewUrl(input, rules);

describe('normalizePreviewUrl', () => {
  it.each([
    'http://localhost:5173',
    'https://localhost:5173',
    'http://127.0.0.1:3000/app?x=1#top',
    'https://staging.example.com',
    'http://[::1]:8080',
  ])('accepts %s as it is', (url) => {
    expect(normalize(url)).toEqual({ ok: true, url });
  });

  it('trims surrounding space', () => {
    expect(normalize('  http://localhost:5173 ')).toEqual({
      ok: true,
      url: 'http://localhost:5173',
    });
  });

  it.each([
    ['localhost:5173', 'http://localhost:5173'],
    ['localhost', 'http://localhost'],
    ['127.0.0.1:3000/app', 'http://127.0.0.1:3000/app'],
    ['my-app.localhost:8080', 'http://my-app.localhost:8080'],
    ['[::1]:5173', 'http://[::1]:5173'],
    ['example.com', 'http://example.com'],
  ])('offers %s back as %s', (input, url) => {
    expect(normalize(input)).toEqual({ ok: true, url });
  });

  it.each(['ftp://localhost:21', 'file:///etc/hosts', 'ws://localhost:5173'])(
    'rejects the scheme of %s',
    (url) => {
      expect(normalize(url)).toEqual({ ok: false, problem: PROBLEMS.scheme });
    },
  );

  it.each(['/app', './index.html', '', 'not a url', 'javascript:alert(1)', 'http://'])(
    'rejects %j as not absolute',
    (url) => {
      expect(normalize(url)).toEqual({ ok: false, problem: PROBLEMS.notAbsolute });
    },
  );

  it.each([
    'http://127.0.0.1:4300',
    'http://localhost:4300/',
    'localhost:4300',
    'http://localhost:4301/api/health',
    '127.0.0.1:4301',
    'http://[::1]:4300',
    'http://0.0.0.0:4301',
    'http://anything.localhost:4300',
    'https://localhost:4300',
  ])('refuses the tool’s own address %s', (url) => {
    expect(normalize(url)).toEqual({ ok: false, problem: PROBLEMS.tool });
  });

  it('refuses the exact origin the tool is served from, whatever its port', () => {
    const elsewhere = { toolOrigin: 'http://studio.test:9000', toolPorts: TOOL_PORTS };
    expect(normalizePreviewUrl('http://studio.test:9000/x', elsewhere)).toEqual({
      ok: false,
      problem: PROBLEMS.tool,
    });
  });

  it('allows the tool’s ports on a host that isn’t this machine', () => {
    expect(normalize('http://192.168.1.20:4300')).toEqual({
      ok: true,
      url: 'http://192.168.1.20:4300',
    });
  });
});

describe('checkPreviewUrl', () => {
  it('does not add a scheme to a stored URL', () => {
    expect(check('localhost:5173').ok).toBe(false);
  });

  it('flags a hand-edited ftp URL', () => {
    expect(check('ftp://x')).toEqual({ ok: false, problem: PROBLEMS.scheme });
  });

  it('accepts a good stored URL unchanged', () => {
    expect(check('http://localhost:5173')).toEqual({ ok: true, url: 'http://localhost:5173' });
  });
});

describe('isLoopback', () => {
  it.each(['localhost', 'LOCALHOST', 'a.localhost', '127.0.0.1', '127.1.2.3', '[::1]', '0.0.0.0'])(
    '%s is this machine',
    (host) => expect(isLoopback(host)).toBe(true),
  );
  it.each(['example.com', '10.0.0.1', 'localhost.example.com', '[::2]'])('%s is not', (host) =>
    expect(isLoopback(host)).toBe(false),
  );
  it('catches IPv4-mapped loopback as URL normalises it', () => {
    expect(isLoopback(new URL('http://[::ffff:127.0.0.1]:4300').hostname)).toBe(true);
  });
});
