import type { PreviewCheck } from '@modelwright/schema';
import { embeddingVerdict } from './frameHeaders';

export interface PreviewCheckOptions {
  /** The web app's origin, which the preview's frame headers must allow. */
  toolOrigin: string;
  /** modelwright's own ports. A loopback URL on one of them is the tool, not a project. */
  toolPorts: readonly number[];
  /** The whole check, redirects included, gives up after this long. */
  timeoutMs?: number;
  maxRedirects?: number;
  /** Whether frame-blocking headers count (an iframe), or not (a top-level page). Default true. */
  framing?: boolean;
}

export const PREVIEW_TIMEOUT_MS = 3000;
export const PREVIEW_MAX_REDIRECTS = 5;

/**
 * Requests a preview URL the way the iframe will, and says whether the iframe can show it. A
 * browser can't tell why a cross-origin iframe is blank, so the host process finds out. Any HTTP
 * status counts as `ok`: the dev server is running and the iframe shows its error page.
 *
 * Only the headers are read. The body is cancelled unread and nothing from it is returned.
 * The rules for what's `invalid` mirror packages/project/src/rules/url.ts.
 */
export async function checkPreview(
  raw: string,
  {
    toolOrigin,
    toolPorts,
    timeoutMs = PREVIEW_TIMEOUT_MS,
    maxRedirects = PREVIEW_MAX_REDIRECTS,
    framing = true,
  }: PreviewCheckOptions,
): Promise<PreviewCheck> {
  const first = parseHttpUrl(raw);
  if (!first) return { status: 'invalid', detail: 'Not an absolute http:// or https:// URL' };
  if (isToolAddress(first, toolOrigin, toolPorts)) {
    return { status: 'invalid', detail: 'That’s modelwright’s own address' };
  }

  const signal = AbortSignal.timeout(timeoutMs);
  let url = first;
  try {
    for (let hops = 0; ; hops++) {
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal });
      void res.body?.cancel().catch(() => {});

      const location = isRedirect(res.status) ? res.headers.get('location') : null;
      if (location === null) {
        if (!framing) return { status: 'ok' };
        const verdict = embeddingVerdict(res.headers, toolOrigin, url.href);
        return verdict.refused
          ? { status: 'refuses-embedding', detail: verdict.detail }
          : { status: 'ok' };
      }

      if (hops >= maxRedirects) {
        return { status: 'unreachable', detail: `Too many redirects (more than ${maxRedirects})` };
      }
      const next = parseHttpUrl(location, url);
      if (!next) return { status: 'invalid', detail: 'Redirects to a URL that isn’t http(s)' };
      if (isToolAddress(next, toolOrigin, toolPorts)) {
        return { status: 'invalid', detail: 'Redirects to modelwright’s own address' };
      }
      url = next;
    }
  } catch (err) {
    return { status: 'unreachable', detail: describeFailure(err, timeoutMs) };
  }
}

function parseHttpUrl(text: string, base?: URL): URL | null {
  try {
    const url = new URL(text, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname === '' ? null : url;
  } catch {
    return null;
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isToolAddress(url: URL, toolOrigin: string, toolPorts: readonly number[]): boolean {
  if (url.origin === toolOrigin) return true;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return isLoopback(url.hostname) && toolPorts.includes(port);
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^127\.\d+\.\d+\.\d+$/.test(host) ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '[::]' ||
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host)
  );
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** A short, fixed description of a failed request. Never the error's own message, which can be long. */
function describeFailure(err: unknown, timeoutMs: number): string {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    const seconds = Math.round(timeoutMs / 100) / 10;
    return `No response within ${seconds} s — it may still be starting`;
  }
  const code = errorCode(err);
  if (code === 'ECONNREFUSED') return 'Connection refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Host not found';
  if (code !== undefined && TLS_CODES.has(code)) return `Certificate not trusted (${code})`;
  return code ? `Couldn’t connect (${code})` : 'Couldn’t connect';
}

/** fetch wraps the socket error in `cause`, sometimes twice (AggregateError for several addresses). */
function errorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    const e = current as { code?: unknown; cause?: unknown; errors?: unknown[] };
    if (typeof e.code === 'string' && e.code !== 'UND_ERR_SOCKET') return e.code;
    current = e.cause ?? e.errors?.[0];
  }
  return undefined;
}
