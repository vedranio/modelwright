import type { MiddlewareHandler } from 'hono';

export interface GuardOptions {
  allowedHosts: readonly string[];
  allowedOrigins: readonly string[];
}

/**
 * Binding to 127.0.0.1 keeps other machines out but not other websites: any page open in the
 * browser can send requests to localhost. This rejects requests that don't come from the web app.
 *
 * - `Host` must be one of ours, which defeats DNS rebinding (an attacker's hostname resolving to 127.0.0.1).
 * - `Origin`, when the browser sends one, must be the web app's, which stops cross-site writes.
 *   Non-browser clients (curl, tests) send no Origin and are allowed.
 */
export function originGuard({ allowedHosts, allowedOrigins }: GuardOptions): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host');
    if (!host || !allowedHosts.includes(host.toLowerCase())) {
      return c.json({ message: 'Forbidden host' }, 403);
    }
    const origin = c.req.header('origin');
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      return c.json({ message: 'Forbidden origin' }, 403);
    }
    await next();
  };
}
