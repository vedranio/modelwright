import { useEffect, useRef, useState, type FormEvent } from 'react';
import { announcedUrls } from '@modelwright/project/rules';
import { CommandSnippet } from '../CommandSnippet';
import { Icon } from '../Icon';
import { FieldError } from '../ui';
import type { DevServer } from './useDevServer';

/**
 * Starting the project's dev server from a UI-view card: Start with the command it runs, the
 * run in progress, a crash, or (with no command yet) a field to set one.
 */
export function DevServerStart({
  server,
  devCommand,
  onSetDevCommand,
}: {
  server: DevServer;
  devCommand?: string;
  onSetDevCommand: (command: string) => void;
}) {
  const { state } = server;
  if (!devCommand) return <DevCommandField onCommit={onSetDevCommand} />;

  if (state.status === 'running') {
    return (
      <div className="dev-start">
        <p className="state-step">
          Starting <code>{state.command}</code>…
        </p>
        <div className="dev-start-actions">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void server.stop()}
            disabled={server.busy}
          >
            <Icon name="stop" />
            Stop
          </button>
        </div>
      </div>
    );
  }

  const crashed = state.status === 'exited' && (state.error || (state.exitCode ?? 0) !== 0);
  return (
    <div className="dev-start">
      {crashed && (
        <p className="state-detail">
          The dev server stopped{state.error ? `: ${state.error}` : ` (exit ${state.exitCode})`}.
          Its output is in the log below.
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void server.start()}
        disabled={server.busy}
      >
        <Icon name="play_arrow" />
        {crashed ? 'Start again' : 'Start dev server'}
      </button>
      <p className="state-step">Or run it yourself:</p>
      <CommandSnippet command={devCommand} />
      {server.error && <FieldError message={server.error} />}
    </div>
  );
}

/** Setting the dev command, when the project has none. It's saved to config.json. */
function DevCommandField({ onCommit }: { onCommit: (command: string) => void }) {
  const [text, setText] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) onCommit(text.trim());
  };
  return (
    <form className="dev-command-field" onSubmit={submit}>
      <label className="field-label" htmlFor="dev-command">
        Dev command
      </label>
      <p className="state-step">
        The command that starts it, run in the project folder, e.g. <code>npm run dev</code>. It’s
        saved to .design/config.json, and modelwright can then start it for you.
      </p>
      <div className="dev-command-row">
        <input
          id="dev-command"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="npm run dev"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-secondary" disabled={!text.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * The dev server's output, as a strip along the bottom of the UI view that opens into a log.
 * It offers the address the server announced when that isn't the preview's.
 */
export function DevServerLog({
  server,
  open,
  onToggle,
  previewUrl,
  onUseUrl,
}: {
  server: DevServer;
  open: boolean;
  onToggle: () => void;
  previewUrl?: string;
  onUseUrl: (url: string) => void;
}) {
  const { state, lines } = server;
  const body = useRef<HTMLPreElement>(null);
  const [pinned, setPinned] = useState(true);

  // Follow new output, unless scrolled up to read.
  useEffect(() => {
    const el = body.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [lines, pinned, open]);

  const announced = announcedUrls(lines);
  const suggested = announced.find((url) => !sameAddress(url, previewUrl));
  const status =
    state.status === 'running'
      ? 'running'
      : state.error
        ? 'couldn’t start'
        : state.signal
          ? 'stopped'
          : `exited (${state.exitCode ?? 0})`;

  return (
    <section className={`devlog${open ? ' open' : ''}`} aria-label="Dev server log">
      <header className="devlog-head">
        <button
          type="button"
          className="btn btn-quiet btn-tight devlog-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <Icon name="terminal" />
          Dev server
          <span className={`devlog-status devlog-${state.status}`}>{status}</span>
          <Icon name={open ? 'keyboard_arrow_down' : 'keyboard_arrow_up'} />
        </button>
        <code className="devlog-command" title={state.command}>
          {state.command}
        </code>
        {suggested && previewUrl !== undefined && (
          <span className="devlog-suggest">
            Serving at <code>{suggested}</code>
            <button
              type="button"
              className="btn btn-secondary btn-tight"
              onClick={() => onUseUrl(suggested)}
            >
              Use this URL
            </button>
          </span>
        )}
        {state.status === 'running' ? (
          <button
            type="button"
            className="btn btn-quiet btn-tight"
            onClick={() => void server.stop()}
            disabled={server.busy}
          >
            <Icon name="stop" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-quiet btn-tight"
            onClick={() => void server.start()}
            disabled={server.busy}
          >
            <Icon name="play_arrow" />
            Start
          </button>
        )}
      </header>
      {open && (
        <pre
          ref={body}
          className="devlog-body"
          onScroll={(e) => {
            const el = e.currentTarget;
            setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
          }}
        >
          {lines.length > 0 ? lines.join('\n') : 'No output yet.'}
        </pre>
      )}
    </section>
  );
}

/** The same host and port, so "localhost:5173/" and "http://localhost:5173" match. */
function sameAddress(a: string, b: string | undefined): boolean {
  if (b === undefined) return false;
  try {
    const x = new URL(a);
    const y = new URL(b);
    const loop = (h: string) => (h === '127.0.0.1' || h === '[::1]' ? 'localhost' : h);
    return loop(x.hostname) === loop(y.hostname) && x.port === y.port;
  } catch {
    return false;
  }
}
