import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useProjectClient } from './platform';
import type { DocState } from './useDesign';

interface Props {
  projectPath: string;
  config: DocState<'config'>;
  /** Shown when config.json can't be read, so the header always has a name. */
  fallbackName: string;
  onSaved: () => Promise<void>;
  onEditingChange: (editing: boolean) => void;
}

/** The project name in the header. Click to edit; Enter or blur saves to config.json, Escape cancels. */
export function ProjectName({
  projectPath,
  config,
  fallbackName,
  onSaved,
  onEditingChange,
}: Props) {
  const client = useProjectClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = config.status === 'ok' ? config.doc.name : fallbackName;
  const editable = config.status === 'ok';

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

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (draft === null || saving || config.status !== 'ok') return;
    const next = draft;
    if (next === config.doc.name) return stopEditing();
    if (next.trim() === '') {
      setError('Name can’t be empty');
      return;
    }
    setSaving(true);
    try {
      await client.writeDesign(projectPath, 'config', { ...config.doc, name: next });
      stopEditing();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
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
            className="project-name"
            onClick={startEditing}
            title="Rename project"
          >
            {name}
          </button>
        ) : (
          <span className="project-name">{name}</span>
        )}
        {error && (
          <span className="error inline" role="alert">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <form className="project-name-wrap" onSubmit={save}>
      <input
        className="project-name-input"
        aria-label="Project name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={onKeyDown}
        disabled={saving}
        autoFocus
      />
      {error && (
        <span className="error inline" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
