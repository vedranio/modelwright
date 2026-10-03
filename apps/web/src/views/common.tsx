import type { ReactNode } from 'react';

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** An honest empty state: says what's missing and how to add it today. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
