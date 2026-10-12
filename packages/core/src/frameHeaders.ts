/**
 * Whether a response lets the tool show it in an iframe, decided from its headers the way
 * browsers decide it:
 *
 * - When any enforced `Content-Security-Policy` has a `frame-ancestors` directive, that decides,
 *   and `X-Frame-Options` is ignored. Every such policy must allow the tool's origin.
 * - Otherwise `X-Frame-Options: DENY` or `SAMEORIGIN` refuses. The preview is never same-origin
 *   with the tool, so SAMEORIGIN always refuses. Other values (`ALLOW-FROM`) are ignored, as
 *   browsers ignore them now.
 *
 * `Content-Security-Policy-Report-Only` never blocks anything, so it isn't read.
 */

export type EmbeddingVerdict = { refused: false } | { refused: true; detail: string };

const MAX_DETAIL = 160;

export function embeddingVerdict(
  headers: Headers,
  toolOrigin: string,
  responseUrl: string,
): EmbeddingVerdict {
  const tool = new URL(toolOrigin);
  const resource = new URL(responseUrl);

  const csp = headers.get('content-security-policy');
  if (csp !== null) {
    // Several CSP headers arrive joined with commas; each is its own policy.
    const directives = csp
      .split(',')
      .map(frameAncestors)
      .filter((d): d is string => d !== null);
    if (directives.length > 0) {
      const refusing = directives.find((sources) => !allows(sources, tool, resource));
      if (refusing === undefined) return { refused: false };
      return {
        refused: true,
        detail: clip(`Content-Security-Policy: frame-ancestors ${refusing}`.trim()),
      };
    }
  }

  const xfo = headers.get('x-frame-options');
  if (xfo !== null) {
    const values = xfo.split(',').map((v) => v.trim().toUpperCase());
    const refusing = values.find((v) => v === 'DENY' || v === 'SAMEORIGIN');
    if (refusing) return { refused: true, detail: `X-Frame-Options: ${refusing}` };
  }
  return { refused: false };
}

/** The source list of a policy's first `frame-ancestors` directive, or null when it has none. */
function frameAncestors(policy: string): string | null {
  for (const directive of policy.split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name?.toLowerCase() === 'frame-ancestors') return sources.join(' ');
  }
  return null;
}

/** Whether a `frame-ancestors` source list matches the tool's origin. */
export function allows(sourceList: string, tool: URL, resource: URL): boolean {
  const sources = sourceList.split(/\s+/).filter(Boolean);
  // 'none' only means "nothing" on its own; beside other sources it's ignored.
  return sources.some((source) => matches(source, tool, resource));
}

function matches(source: string, tool: URL, resource: URL): boolean {
  const lower = source.toLowerCase();
  if (lower === "'none'") return false;
  if (lower === "'self'") return tool.host === resource.host && sameOrUpgraded(tool, resource);
  if (lower === '*') return tool.protocol === 'http:' || tool.protocol === 'https:';
  if (lower.startsWith("'")) return false; // nonces, hashes and keywords don't apply here

  // A scheme source: `http:` or `https:`.
  const schemeOnly = /^([a-z][a-z0-9+.-]*):$/.exec(lower);
  if (schemeOnly?.[1] !== undefined) return schemeMatches(schemeOnly[1], tool.protocol);

  // A host source: [scheme://]host[:port][/path]
  const host = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[^:/]+)(?::(\d+|\*))?(?:\/.*)?$/.exec(
    lower,
  );
  if (!host) return false;
  const [, scheme, hostPattern = '', port] = host;
  const schemeOk =
    scheme === undefined ? sameOrUpgraded(tool, resource) : schemeMatches(scheme, tool.protocol);
  if (!schemeOk) return false;

  const toolHost = tool.hostname.toLowerCase();
  const hostOk =
    hostPattern === '*' ||
    (hostPattern.startsWith('*.')
      ? toolHost.endsWith(hostPattern.slice(1))
      : hostPattern === toolHost);
  if (!hostOk) return false;

  if (port === '*') return true;
  const toolPort = tool.port || defaultPort(tool.protocol);
  if (port === undefined) return toolPort === defaultPort(tool.protocol);
  return port === toolPort;
}

/** The tool's scheme is the resource's, or its https upgrade. */
function sameOrUpgraded(tool: URL, resource: URL): boolean {
  return (
    tool.protocol === resource.protocol ||
    (resource.protocol === 'http:' && tool.protocol === 'https:')
  );
}

/** `http` in a source also matches `https` (an upgrade), never the reverse. */
function schemeMatches(scheme: string, protocol: string): boolean {
  if (scheme === 'http') return protocol === 'http:' || protocol === 'https:';
  return `${scheme}:` === protocol;
}

function defaultPort(protocol: string): string {
  return protocol === 'https:' ? '443' : '80';
}

function clip(text: string): string {
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL - 1)}…` : text;
}
