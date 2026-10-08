/** The scheme and host modelwright's own pages are served from in the packaged app. */
export const APP_SCHEME = 'app';
export const APP_ORIGIN = 'app://modelwright';

/**
 * Whether `url` is on `origin` (scheme, host and port). Node's URL gives custom schemes an
 * opaque origin, so they're compared piece by piece.
 */
export function isOnOrigin(url: string, origin: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(origin);
    return a.protocol === b.protocol && a.host === b.host && a.host !== '';
  } catch {
    return false;
  }
}

/** Only web links leave the app, to the default browser. */
export function isExternalWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
