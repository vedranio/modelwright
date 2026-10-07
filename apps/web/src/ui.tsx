import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** The modelwright logo mark. */
export function Logo() {
  // The m and w share their middle stroke; the arches and bowls overshoot the flat stem ends
  // slightly so both letters read as the same height. Source art lives in brand/.
  return (
    <svg className="logo" viewBox="0 0 1680 960" aria-hidden="true">
      <rect width="1680" height="960" rx="200" />
      <path
        transform="translate(840 480) scale(1.1) translate(-500 -220)"
        d="M0 440V159A125 125 0 0 1 250 159A125 125 0 0 1 500 159V281A125 125 0 0 0 750 281A125 125 0 0 0 1000 281V0M250 159V440M750 281V0"
      />
    </svg>
  );
}

/**
 * A keyboard hint inside a button or beside a control, e.g. ↵ or ⇧1. In a text hint, ⇧ is drawn
 * with Material Symbols' shift icon: the font's ⇧ is too narrow to read at hint size.
 */
export function Kbd({ children }: { children: ReactNode }) {
  const parts =
    typeof children === 'string'
      ? children
          .split('⇧')
          .flatMap((text, i) => [
            ...(i > 0 ? [<Icon key={`shift-${i}`} name="shift" />] : []),
            ...(text ? [text] : []),
          ])
      : children;
  return <span className="kbd">{parts}</span>;
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
