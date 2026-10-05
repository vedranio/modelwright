import { useState } from 'react';
import { Cardinality } from '@modelwright/schema';
import { useErdEditor } from './editor';
import { CARDINALITY_LABELS } from './markers';
import { deleteRelationships, reverseRelationship, updateRelationship } from './ops';

interface Props {
  relationshipId: string;
  fromName: string;
  toName: string;
  fromCard: Cardinality;
  toCard: Cardinality;
  label: string;
}

/**
 * Shown under a selected relationship: a cardinality for each end (named after its entity),
 * the label, Reverse direction and Delete. Changes apply as they're made.
 */
export function EdgePopover({ relationshipId, fromName, toName, fromCard, toCard, label }: Props) {
  const { apply } = useErdEditor();
  const update = (changes: Parameters<typeof updateRelationship>[2]) =>
    apply((erd) => updateRelationship(erd, relationshipId, changes));

  return (
    <div
      className="edge-popover nodrag nowheel nopan"
      role="dialog"
      aria-label="Relationship"
      // Clicks inside the popover mustn't reach the canvas and clear the selection.
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <CardinalityPicker
        name={fromName}
        value={fromCard}
        onChange={(card) => update({ fromCard: card })}
      />
      <CardinalityPicker
        name={toName}
        value={toCard}
        onChange={(card) => update({ toCard: card })}
      />
      <LabelField key={label} value={label} onCommit={(value) => update({ label: value.trim() })} />
      <div className="edge-popover-actions">
        <button
          type="button"
          className="btn btn-quiet btn-tight"
          onClick={() => apply((erd) => reverseRelationship(erd, relationshipId))}
        >
          Reverse direction
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-tight edge-delete"
          onClick={() => apply((erd) => deleteRelationships(erd, [relationshipId]))}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function CardinalityPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Cardinality;
  onChange: (card: Cardinality) => void;
}) {
  return (
    <label className="edge-field">
      <span className="edge-field-label" title={name}>
        {name}
      </span>
      <select
        className="edge-select"
        value={value}
        onChange={(e) => onChange(Cardinality.parse(e.target.value))}
      >
        {Cardinality.options.map((card) => (
          <option key={card} value={card}>
            {CARDINALITY_LABELS[card].glyph} {CARDINALITY_LABELS[card].words}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The label input. Enter or blur saves; Escape puts back what was there. */
function LabelField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="edge-field">
      <span className="edge-field-label">Label</span>
      <input
        className="input edge-input"
        value={draft}
        placeholder="e.g. owns"
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
