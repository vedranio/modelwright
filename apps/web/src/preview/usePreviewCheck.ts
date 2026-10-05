import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectClient, type PreviewCheck } from '../platform';

/** A first check that takes longer than this shows the "Checking" state; a quick one never does. */
export const CHECKING_DELAY_MS = 300;

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

  const recheck = useCallback(() => void run(), [run]);

  return { result, slow: result === null && slowFor === url, recheck };
}
