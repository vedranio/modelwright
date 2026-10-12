import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Host } from '../platform';

/** modelwright's own things that can sit over the preview: dialogs, menus, popovers, toasts. */
const OVERLAYS = '.dialog-scrim, .scrim, .theme-menu-list, .build-popover, .toast';

interface Props {
  host: Host;
  url: string;
  reload: number;
  width: number;
  height: number;
  mobile: boolean;
  scale: number;
  /** Whether the UI view is showing. */
  visible: boolean;
}

/**
 * The desktop app's preview screen. The page itself is a native view that main places over
 * this element, emulating the device; this keeps its place in the frame and tells main where
 * it is. A native view sits above the page, so while one of modelwright's overlays covers it,
 * a snapshot stands in and the view is hidden.
 */
export function NativeScreen({ host, url, reload, width, height, mobile, scale, visible }: Props) {
  const screen = useRef<HTMLDivElement>(null);
  const covered = useCovered(screen, visible);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  /** The view is hidden for an overlay once the snapshot is up to stand in for it. */
  const standIn = covered && snapshot !== null;

  useEffect(() => {
    let current = true;
    const settle = covered
      ? host.snapshotPreview()
      : // Let the view show again before the stand-in goes, so nothing flickers.
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 100));
    void settle.then((image) => {
      if (current) setSnapshot(image);
    });
    return () => {
      current = false;
    };
  }, [covered, host]);

  // Where the screen is, on every render and whenever the window changes size.
  const [, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    const el = screen.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(el.parentElement ?? el).borderTopLeftRadius) || 0;
    host.setPreview({
      url,
      reload,
      bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      viewport: { width: Math.round(width), height: Math.round(height) },
      mobile,
      scale,
      radius: radius * scale,
      visible: visible && !standIn && rect.width > 0,
    });
  });
  // Gone with the UI view's preview (a stopped server, a closed project).
  useEffect(() => () => host.setPreview(null), [host]);

  return (
    <div ref={screen} className="device-iframe native-screen" style={{ width, height }}>
      {snapshot && <img className="native-screen-snapshot" src={snapshot} alt="" />}
    </div>
  );
}

/** Whether any of modelwright's overlays overlaps the element. */
function useCovered(target: React.RefObject<HTMLElement | null>, active: boolean): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = target.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const hit = [...document.querySelectorAll(OVERLAYS)].some((o) => {
          const b = o.getBoundingClientRect();
          return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
        });
        setCovered(hit);
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target, active]);
  return active && covered;
}
