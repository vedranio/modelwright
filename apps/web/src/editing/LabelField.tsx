import { useState } from 'react';

/**
 * An edge's label input in a popover. Enter or blur saves; Escape puts back what was there.
 * Key it by `value` so an outside change resets the draft.
 */
export function LabelField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="edge-field">
      <span className="edge-field-label">Label</span>
      <input
        className="input edge-input"
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
    </label>
  );
}
