import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { FieldError } from '../ui';
import { TOOL_PORTS, normalizePreviewUrl, type UrlRules } from './url';

/** The tool's own address, as the URL rules need it. */
export function toolRules(): UrlRules {
  return { toolOrigin: window.location.origin, toolPorts: TOOL_PORTS };
}

interface Props {
  /** The starting text. */
  initial?: string;
  placeholder?: string;
  /** A submit button's label. Without one, Enter commits. */
  submitLabel?: string;
  /** Commits a blank value as `''` (clearing the URL) instead of asking for an address. */
  allowClear?: boolean;
  /** Commits on blur when the value is valid or unchanged. */
  commitOnBlur?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Receives the validated URL (with `http://` added to a bare host), or `''` to clear. */
  onCommit: (url: string) => void;
  /** Escape, or a blur that doesn't commit. */
  onCancel?: () => void;
}

/** A preview URL input. Every URL entered in the tool passes through here and `preview/url.ts`. */
export function UrlField({
  initial = '',
  placeholder = 'http://localhost:5173',
  submitLabel,
  allowClear = false,
  commitOnBlur = false,
  autoFocus = false,
  className,
  onCommit,
  onCancel,
}: Props) {
  const [text, setText] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);

  /** Validates and commits. Returns false when the value was refused. */
  function commit(): boolean {
    if (text.trim() === '') {
      if (allowClear) {
        onCommit('');
        return true;
      }
      setProblem('Enter your dev server’s address.');
      return false;
    }
    const result = normalizePreviewUrl(text, toolRules());
    if (!result.ok) {
      setProblem(result.problem);
      return false;
    }
    setText(result.url);
    onCommit(result.url);
    return true;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    commit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel?.();
    }
  }

  function onBlur() {
    if (!commitOnBlur) return;
    if (text === initial) onCancel?.();
    else commit();
  }

  return (
    <form className={`url-field${className ? ` ${className}` : ''}`} onSubmit={onSubmit}>
      <div className="url-field-row">
        <input
          className={`input${problem ? ' input-error' : ''}`}
          type="text"
          inputMode="url"
          aria-label="Preview URL"
          aria-invalid={problem ? true : undefined}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onFocus={(e) => e.currentTarget.select()}
          spellCheck={false}
          autoComplete="off"
          autoFocus={autoFocus}
        />
        {submitLabel && (
          <button type="submit" className="btn btn-primary">
            {submitLabel}
          </button>
        )}
      </div>
      {problem && <FieldError message={problem} />}
    </form>
  );
}

/**
 * A preview URL shown as text: double-click to edit it inline with the same validation.
 * Enter or blur saves; a blank value clears the URL; Escape cancels.
 */
export function EditableUrl({
  url,
  onCommit,
  className,
}: {
  url: string;
  onCommit: (url: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <span className={`editable-url editing${className ? ` ${className}` : ''}`}>
        <UrlField
          className="url-inline"
          initial={url}
          allowClear
          commitOnBlur
          autoFocus
          onCommit={(next) => {
            setEditing(false);
            onCommit(next);
          }}
          onCancel={() => setEditing(false)}
        />
        <span className="hint">↵ save · esc cancel</span>
      </span>
    );
  }
  return (
    <span
      className={`editable-url url-text${className ? ` ${className}` : ''}`}
      title="Double-click to edit"
      onDoubleClick={() => setEditing(true)}
    >
      {url}
    </span>
  );
}
