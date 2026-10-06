import { useEffect, useState } from 'react';
import { copyText } from '../clipboard';
import { EmptyCard } from '../views/common';
import { EditableUrl, UrlField } from './UrlField';
import { Icon } from '../Icon';

/** The first check is taking a moment. Quiet on purpose: most checks return before this shows. */
export function CheckingState({ url }: { url: string }) {
  return (
    <div className="preview-checking" role="status">
      Checking {url}…
    </div>
  );
}

/** Nothing answered at the URL: the dev server isn't running yet (or the address is wrong). */
export function NothingRunning({
  url,
  detail,
  devCommand,
  onSetUrl,
}: {
  url: string;
  detail?: string;
  devCommand?: string;
  onSetUrl: (url: string) => void;
}) {
  return (
    <EmptyCard title="Nothing running at">
      <EditableUrl className="state-url" url={url} onCommit={onSetUrl} />
      {detail && <p className="state-detail">{detail}</p>}
      <p className="state-step">Start your project’s dev server.</p>
      {devCommand && <CommandSnippet command={devCommand} />}
      <p className="state-waiting" role="status">
        Checking again…
      </p>
    </EmptyCard>
  );
}

/** The server answered but its frame headers forbid showing it inside the tool. */
export function RefusesEmbedding({
  url,
  detail,
  onSetUrl,
}: {
  url: string;
  detail?: string;
  onSetUrl: (url: string) => void;
}) {
  const header = detail?.split(':')[0] ?? 'A frame header';
  return (
    <EmptyCard
      title="This page refuses to be embedded"
      actions={
        <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">
          <Icon name="open_in_browser" />
          Open in browser
        </a>
      }
    >
      <EditableUrl className="state-url" url={url} onCommit={onSetUrl} />
      {detail && <code className="state-header">{detail}</code>}
      <p className="state-step">
        {header} tells browsers not to show this page inside another one, so it can’t appear in the
        preview frame.
      </p>
      <p className="state-hint">
        To preview it here, change the dev server’s frame headers: drop X-Frame-Options, or allow{' '}
        {window.location.origin} in its Content-Security-Policy frame-ancestors.
      </p>
    </EmptyCard>
  );
}

/** The stored URL (hand-edited, or rejected by the check) can't be previewed. */
export function InvalidUrl({
  url,
  problem,
  onSetUrl,
}: {
  url: string;
  problem: string;
  onSetUrl: (url: string) => void;
}) {
  return (
    <EmptyCard title="This preview URL can’t be used">
      <p className="state-problem">{problem}</p>
      <UrlField
        key={url}
        className="empty-url"
        initial={url}
        allowClear
        submitLabel="Save URL"
        onCommit={onSetUrl}
      />
    </EmptyCard>
  );
}

/** `devCommand` in a snippet with a Copy button. */
function CommandSnippet({ command }: { command: string }) {
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="command">
      <code className="command-text">{command}</code>
      <button
        type="button"
        className="btn btn-quiet btn-tight"
        onClick={() => void copyText(command).then((ok) => setCopied(ok ? 'copied' : 'failed'))}
      >
        {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Couldn’t copy' : 'Copy'}
      </button>
    </div>
  );
}
