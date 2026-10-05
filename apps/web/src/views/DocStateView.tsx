import { useEffect, useState, type ReactNode } from 'react';
import type { Issue } from '@modelwright/schema';
import type { DesignDoc, DesignKind } from '../platform';
import type { DocState } from '../useDesign';
import { plural } from './common';
import { copyText } from '../clipboard';
import { ReloadGlyph } from '../ui';

interface Props<K extends DesignKind> {
  kind: K;
  state: DocState<K>;
  onReload: () => void;
  children: (doc: DesignDoc<K>) => ReactNode;
}

/** How each file is named in headings, and which views keep working while it's broken. */
const FILE_COPY: Record<DesignKind, { title: string; others: string }> = {
  erd: { title: 'ERD', others: 'Flows and UI' },
  flows: { title: 'Flows', others: 'ERD and UI' },
  config: { title: 'config', others: 'ERD and Flows' },
};

/** Renders a view's document, or its loading, invalid or error state instead. */
export function DocStateView<K extends DesignKind>({ kind, state, onReload, children }: Props<K>) {
  switch (state.status) {
    case 'loading':
      return <p className="view-loading">Loading .design/{kind}.json…</p>;
    case 'error':
      return (
        <Problems kind={kind} onReload={onReload} chip={null}>
          <p className="problems-copy">{state.message}</p>
        </Problems>
      );
    case 'invalid':
      return (
        <Problems
          kind={kind}
          onReload={onReload}
          chip={plural(state.issues.length, 'problem', 'problems')}
          issues={state.issues}
        >
          <p className="problems-copy">
            Fix these in your editor, then reload. Nothing on disk has been changed, and{' '}
            {FILE_COPY[kind].others} still work.
          </p>
          <ul className="issues">
            {state.issues.map((issue, i) => (
              <li key={i} className="issue">
                <span className="dot dot-warning" aria-hidden="true" />
                <div className="issue-text">
                  <span className="issue-path">
                    {pathSegments(issue.path).map((segment, j) => (
                      <span key={j}>
                        {j > 0 && <span className="issue-sep"> › </span>}
                        {segment}
                      </span>
                    ))}
                  </span>
                  <span className="issue-message">{issue.message}</span>
                </div>
              </li>
            ))}
          </ul>
        </Problems>
      );
    case 'ok':
      return <>{children(state.doc)}</>;
  }
}

function Problems({
  kind,
  chip,
  issues,
  onReload,
  children,
}: {
  kind: DesignKind;
  chip: string | null;
  issues?: Issue[];
  onReload: () => void;
  children: ReactNode;
}) {
  const [copyResult, setCopyResult] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (!copyResult) return;
    const timer = setTimeout(() => setCopyResult(null), 1500);
    return () => clearTimeout(timer);
  }, [copyResult]);

  return (
    <div className="problems" role="alert">
      <div className="problems-chip">
        <span className="chip">.design/{kind}.json</span>
        {chip}
      </div>
      <h2 className="problems-title">The {FILE_COPY[kind].title} file couldn't be loaded</h2>
      {children}
      <div className="problems-actions">
        <button type="button" className="btn btn-primary" onClick={onReload}>
          <ReloadGlyph />
          Reload
        </button>
        {issues && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() =>
              void copyText(problemsText(kind, issues)).then((ok) =>
                setCopyResult(ok ? 'copied' : 'failed'),
              )
            }
          >
            {copyResult === 'copied'
              ? 'Copied'
              : copyResult === 'failed'
                ? 'Couldn’t copy'
                : 'Copy problems'}
          </button>
        )}
      </div>
    </div>
  );
}

/** `['relationships', 0, 'to']` → `['relationships', '0', 'to']`; the root is the whole file. */
export function pathSegments(path: Issue['path']): string[] {
  return path.length === 0 ? ['(whole file)'] : path.map(String);
}

/** The plain-text list that Copy problems puts on the clipboard. */
export function problemsText(kind: DesignKind, issues: Issue[]): string {
  const lines = issues.map((issue) => `${pathSegments(issue.path).join(' › ')}: ${issue.message}`);
  return `.design/${kind}.json\n${lines.join('\n')}\n`;
}
