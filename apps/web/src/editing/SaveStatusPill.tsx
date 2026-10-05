import type { Issue } from '@modelwright/schema';
import type { SaveStatus } from './useEditableDoc';

interface Props {
  status: SaveStatus;
  issues: Issue[];
  onRetry: () => void;
}

/** The save status at the canvas's bottom left, styled as in 07-components. */
export function SaveStatusPill({ status, issues, onRetry }: Props) {
  switch (status) {
    case 'saved':
      return (
        <span className="save-pill" role="status">
          <span className="dot dot-success" aria-hidden="true" />
          Saved
        </span>
      );
    case 'saving':
      return (
        <span className="save-pill" role="status">
          <span className="dot dot-hollow" aria-hidden="true" />
          Saving…
        </span>
      );
    case 'unsaved':
      return (
        <span className="save-pill strong" role="status">
          <span className="dot dot-warning" aria-hidden="true" />
          Unsaved changes
        </span>
      );
    case 'failed':
      return (
        <span className="save-pill failed" role="alert">
          <span className="dot dot-error" aria-hidden="true" />
          Couldn't save —{' '}
          <button type="button" className="save-retry" onClick={onRetry}>
            retry
          </button>
        </span>
      );
    case 'invalid':
      return (
        <span
          className="save-pill failed"
          role="alert"
          title={issues
            .map((i) => `${i.path.join(' › ') || '(whole file)'}: ${i.message}`)
            .join('\n')}
        >
          <span className="dot dot-error" aria-hidden="true" />
          Couldn't save — this edit is invalid
        </span>
      );
  }
}
