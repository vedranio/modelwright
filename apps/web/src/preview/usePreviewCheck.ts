import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectClient, type PreviewCheck } from '../platform';

/** A first check that takes longer than this shows the "Checking" state; a quick one never does. */
export const CHECKING_DELAY_MS = 300;

/** While nothing is running, how often to look again. */
export const POLL_INTERVAL_MS = 3000;

export interface PreviewCheckState {
  /** The latest result for this URL; null until the first check returns. */
  result: PreviewCheck | null;
  /** True once a first check has been running long enough to say so. */
  slow: boolean;
  /** Checks again, keeping the current result (and the iframe) until the new one arrives. */
  recheck: () => void;
}

/**
 * Asks ProjectClient whether `url` can be previewed. It checks when the view is shown and when
 * the URL changes. A re-check keeps showing the previous result while it runs, so an `ok`
 * preview stays mounted and only changes if the new result isn't `ok`.
 *
 * While the result is `unreachable`, it checks again every few seconds, so starting the dev
 * server makes the preview appear on its own. That polling stops while the view is hidden or
 * the window is unfocused. Nothing re-checks an `ok` preview in the background.
 */
export function usePreviewCheck(url: string, visible: boolean): PreviewCheckState {
  const client = useProjectClient();
  const [checked, setChecked] = useState<{ url: string; result: PreviewCheck } | null>(null);
  const [slowFor, setSlowFor] = useState<string | null>(null);
  const latest = useRef(0);

  const run = useCallback(async () => {
    const request = ++latest.current;
    let result: PreviewCheck;
    try {
      result = await client.checkPreview(url);
    } catch (err) {
      result = { status: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
    }
    // A newer check (or a URL change) has started; drop this one.
    if (request === latest.current) setChecked({ url, result });
  }, [client, url]);

  // Check when the view is shown and whenever the URL changes while it's shown.
  useEffect(() => {
    if (visible) void run();
  }, [visible, run]);

  const result = checked?.url === url ? checked.result : null;

  useEffect(() => {
    if (result) return;
    const timer = setTimeout(() => setSlowFor(url), CHECKING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [result, url]);

  const focused = useWindowFocus();
  const polling = visible && focused && result?.status === 'unreachable';

  // One check a few seconds after each result, so a slow check (up to its 3 s timeout) never
  // overlaps the next.
  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => void run(), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [polling, checked, run]);

  const recheck = useCallback(() => void run(), [run]);

  return { result, slow: result === null && slowFor === url, recheck };
}

/** Whether the window has focus, kept up to date. */
function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return focused;
}
