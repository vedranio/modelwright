import type { ReactNode } from 'react';
import type { Issue } from '@modelwright/schema';
import type { DesignDoc, DesignKind } from '../platform';
import type { DocState } from '../useDesign';

interface Props<K extends DesignKind> {
  kind: K;
  state: DocState<K>;
  children: (doc: DesignDoc<K>) => ReactNode;
}

/** Renders a view's document, or its loading, invalid or error state instead. */
export function DocStateView<K extends DesignKind>({ kind, state, children }: Props<K>) {
  switch (state.status) {
    case 'loading':
      return <p className="muted">Loading {kind}.json…</p>;
    case 'error':
      return (
        <div className="problem" role="alert">
          <h2>Couldn’t load .design/{kind}.json</h2>
          <p>{state.message}</p>
        </div>
      );
    case 'invalid':
      return <IssueList kind={kind} issues={state.issues} />;
    case 'ok':
      return <>{children(state.doc)}</>;
  }
}

function IssueList({ kind, issues }: { kind: DesignKind; issues: Issue[] }) {
  return (
    <div className="problem" role="alert">
      <h2>.design/{kind}.json has problems</h2>
      <p>Fix the file in a text editor, then press Reload.</p>
      <ul className="issues">
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{formatPath(issue.path)}</code>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `['relationships', 0, 'to']` → `relationships[0].to`; the root is shown as the file itself. */
export function formatPath(path: Issue['path']): string {
  if (path.length === 0) return '(whole file)';
  return path
    .map((segment, i) =>
      typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`,
    )
    .join('');
}
