import type { ReactNode } from 'react';

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** An empty state: a small card centred in the view saying what's missing and how to add it. */
export function EmptyCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-wrap">
      <div className="empty-card">
        <h2 className="empty-title">{title}</h2>
        <div className="empty-copy">{children}</div>
        {actions}
      </div>
    </div>
  );
}
