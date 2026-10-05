import type { ReactNode } from 'react';

/** The modelwright logo mark. */
export function Logo() {
  return <span className="logo" aria-hidden="true" />;
}

/** A keyboard hint inside a button or beside a control, e.g. ↵ or ⇧1. */
export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/** A small round status dot. */
export function Dot({ tone }: { tone: 'success' | 'warning' | 'error' }) {
  return <span className={`dot dot-${tone}`} aria-hidden="true" />;
}

/** The reload glyph used beside "Reload". */
export function ReloadGlyph() {
  return (
    <span className="glyph" aria-hidden="true">
      ↻
    </span>
  );
}
