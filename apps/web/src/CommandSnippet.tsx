import { useEffect, useState } from 'react';
import { copyText } from './clipboard';

/** A command in a snippet with a Copy button. */
export function CommandSnippet({ command }: { command: string }) {
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
