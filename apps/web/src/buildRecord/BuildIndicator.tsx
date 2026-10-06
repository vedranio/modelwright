import { useEffect, useRef, useState } from 'react';
import { DIFF_GROUPS } from '@modelwright/spec';
import { CommandSnippet } from '../CommandSnippet';
import { pathSegments } from '../views/DocStateView';
import type { BuildStatus } from './status';

/** What to run in the project repo to build or update the app. */
export const BUILD_COMMAND = '/modelwright:build-from-design';

const DOT: Partial<Record<BuildStatus['kind'], string>> = {
  'up-to-date': 'dot-success',
  changed: 'dot-accent',
  'invalid-record': 'dot-warning',
  'design-problems': 'dot-warning',
};

/**
 * The header's build status: "Not built yet", "Built 3 hours ago" or "4 changes since last
 * build". Clicking it opens what the next build will apply and the command that applies it.
 * modelwright never builds anything itself.
 */
export function BuildIndicator({ status }: { status: BuildStatus }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  if (status.kind === 'loading') return null;
  const dot = DOT[status.kind];
  const builtAt = 'builtAt' in status ? new Date(status.builtAt) : null;

  return (
    <div className="build-indicator" ref={root}>
      <button
        type="button"
        className="btn btn-quiet btn-tight build-indicator-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={builtAt ? `Last build: ${builtAt.toLocaleString()}` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {dot && <span className={`dot ${dot}`} aria-hidden="true" />}
        {status.text}
      </button>
      {open && (
        <div className="build-popover" role="dialog" aria-label="Changes since last build">
          <BuildDetails status={status} builtAt={builtAt} />
          <p className="build-popover-run">
            Run this in the project repo to build or update the app:
          </p>
          <CommandSnippet command={BUILD_COMMAND} />
        </div>
      )}
    </div>
  );
}

function BuildDetails({ status, builtAt }: { status: BuildStatus; builtAt: Date | null }) {
  const when = builtAt && (
    <p className="build-popover-when">Last build: {builtAt.toLocaleString()}</p>
  );
  switch (status.kind) {
    case 'none':
      return (
        <p className="build-popover-lead">
          Nothing has been built from this design yet. The first build creates the app.
        </p>
      );
    case 'up-to-date':
      return (
        <>
          <p className="build-popover-lead">The app is up to date with the design.</p>
          {when}
        </>
      );
    case 'design-problems':
      return (
        <>
          <p className="build-popover-lead">
            Fix the problems in the design files to see what changed since the last build.
          </p>
          {when}
        </>
      );
    case 'invalid-record':
      return (
        <>
          <p className="build-popover-lead">
            <code>.design/build.json</code> is invalid, so modelwright can’t tell what was built.
          </p>
          <ul className="build-popover-issues">
            {status.issues.map((issue, i) => (
              <li key={i}>
                <span className="issue-path">{pathSegments(issue.path).join(' › ')}</span>{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        </>
      );
    case 'changed':
      return (
        <>
          <p className="build-popover-lead">The next build will apply:</p>
          <div className="build-popover-diff">
            {DIFF_GROUPS.map(({ key, title }) =>
              status.diff[key].length === 0 ? null : (
                <section key={key}>
                  <h3>{title}</h3>
                  <ul>
                    {status.diff[key].map((change, i) => (
                      <li key={i}>{change.text}</li>
                    ))}
                  </ul>
                </section>
              ),
            )}
          </div>
          {when}
        </>
      );
    default:
      return null;
  }
}
