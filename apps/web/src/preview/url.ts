/**
 * The rules for a preview URL. The preview iframe is sandboxed with `allow-same-origin`, which
 * is only safe because the preview never shares the tool's origin, so the tool's own address
 * is refused here. The schema accepts any string for `preview.url`; these rules live in the
 * tool, and a stored URL that breaks them is a view state, not a validation error.
 */

/** modelwright's own ports: the web app and its server (see apps/server/src/config.ts). */
export const TOOL_PORTS: readonly number[] = [4300, 4301];

export interface UrlRules {
  /** The origin the tool is served from, e.g. `http://127.0.0.1:4300`. */
  toolOrigin: string;
  /** Ports that are the tool's on any loopback host. */
  toolPorts: readonly number[];
}

export type UrlCheck = { ok: true; url: string } | { ok: false; problem: string };

export const PROBLEMS = {
  notAbsolute: 'Enter a full address, like http://localhost:5173.',
  scheme: 'Only http:// and https:// addresses can be previewed.',
  tool: 'That’s modelwright’s own address. Enter your project’s dev server instead.',
} as const;

/** A scheme followed by `//`, e.g. `http://` or `ftp://`. */
const WITH_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** A bare host, optionally with a port and path: `localhost`, `localhost:5173/app`, `[::1]:3000`. */
const BARE_HOST =
  /^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)(:\d+)?([/?#].*)?$/i;

/**
 * Checks what someone typed into a URL field. A bare `host:port` (or host) is offered back
 * with `http://`, so `localhost:5173` becomes `http://localhost:5173`.
 */
export function normalizePreviewUrl(input: string, rules: UrlRules): UrlCheck {
  const text = input.trim();
  if (!WITH_SCHEME.test(text) && BARE_HOST.test(text)) {
    return checkPreviewUrl(`http://${text}`, rules);
  }
  return checkPreviewUrl(text, rules);
}

/** Checks a URL as stored in config.json, without adding a scheme. */
export function checkPreviewUrl(text: string, rules: UrlRules): UrlCheck {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, problem: PROBLEMS.notAbsolute };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, problem: WITH_SCHEME.test(text) ? PROBLEMS.scheme : PROBLEMS.notAbsolute };
  }
  if (url.hostname === '') return { ok: false, problem: PROBLEMS.notAbsolute };
  if (isToolAddress(url, rules)) return { ok: false, problem: PROBLEMS.tool };
  return { ok: true, url: text };
}

function isToolAddress(url: URL, { toolOrigin, toolPorts }: UrlRules): boolean {
  if (url.origin === toolOrigin) return true;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return isLoopback(url.hostname) && toolPorts.includes(port);
}

/** Hostnames (as `URL` normalises them) that reach this machine. */
export function isLoopback(hostname: string): boolean {
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
