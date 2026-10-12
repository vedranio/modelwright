import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { APP_SCHEME } from './origin';

/** modelwright's own pages: scripts and styles from itself only, nothing from the network. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React Flow and the canvas position nodes with inline styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ');

/** Must run before the app is ready: `app://` behaves like https (storage, secure context). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Serves the built renderer at `app://modelwright/`, never anything outside its folder. */
export function serveRenderer(rendererDir: string): void {
  const root = path.resolve(rendererDir);
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.resolve(root, `.${relative}`);
    if (file !== root && !file.startsWith(root + path.sep)) {
      return new Response('Not found', { status: 404 });
    }
    const response = await net.fetch(pathToFileURL(file).href);
    const headers = new Headers(response.headers);
    headers.set('content-security-policy', CSP);
    return new Response(response.body, { status: response.status, headers });
  });
}
