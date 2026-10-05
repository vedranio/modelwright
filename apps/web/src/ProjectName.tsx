import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { renameProject } from './config/ops';
import type { EditableDoc } from './editing/useEditableDoc';

interface Props {
  config: EditableDoc<'config'>;
  /** Shown when config.json can't be read, so the header always has a name. */
  fallbackName: string;
  onEditingChange: (editing: boolean) => void;
}

/**
 * The project name in the header. Click to edit; Enter or blur commits through the shared
 * config editor, which saves at once. Escape cancels.
 */
export function ProjectName({ config, fallbackName, onEditingChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doc = config.doc;
  const name = doc?.name ?? fallbackName;
  const editable = doc !== null;
  const saveError = config.status === 'failed' || config.status === 'invalid';

  function startEditing() {
    if (!editable) return;
    setError(null);
    setDraft(name);
    onEditingChange(true);
  }

  function stopEditing() {
    setDraft(null);
    onEditingChange(false);
  }

  function save(event?: FormEvent) {
    event?.preventDefault();
    if (draft === null) return;
    if (draft.trim() === '') {
      setError('Name can’t be empty');
      return;
    }
    config.apply((c) => renameProject(c, draft), { saveNow: true });
    stopEditing();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setError(null);
      stopEditing();
    }
  }

  if (draft === null) {
    return (
      <span className="project-name-wrap">
        {editable ? (
          <button
            type="button"
            className="inline-name"
            onClick={startEditing}
            title="Rename project"
          >
            {name}
          </button>
        ) : (
          <span className="inline-name static">{name}</span>
        )}
        {saveError && (
          <button
            type="button"
            className="inline-error inline-retry"
            role="alert"
            onClick={() => void config.flush()}
          >
            Couldn’t save — retry
          </button>
        )}
      </span>
    );
  }

  return (
    <form className="project-name-wrap" onSubmit={save}>
      <input
        className="inline-name-input"
        size={Math.max(draft.length, 1)}
        aria-label="Project name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => save()}
        onKeyDown={onKeyDown}
        autoFocus
      />
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
