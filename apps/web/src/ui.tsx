import type { ReactNode } from 'react';
import { Icon } from './Icon';

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

/** The reload icon beside "Reload" and "Reload preview": Material Symbols' refresh. */
export function ReloadGlyph() {
  return <Icon name="refresh" />;
}

/** A field's error line, with an error dot. */
export function FieldError({ message }: { message: string }) {
  return (
    <p className="field-error" role="alert">
      <Dot tone="error" />
      {message}
    </p>
  );
}
