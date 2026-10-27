import { Cardinality } from '@modelwright/schema';
import { LabelField } from '../editing/LabelField';
import { deletionSummary } from './deletion';
import { useErdEditor } from './editor';
import { CARDINALITY_LABELS } from './markers';
import { clearRelationshipAnchors } from './anchors';
import { deleteRelationships, reverseRelationship, updateRelationship } from './ops';

interface Props {
  relationshipId: string;
  fromName: string;
  toName: string;
  fromCard: Cardinality;
  toCard: Cardinality;
  label: string;
  /** Whether either end is fixed where it joins its card. */
  anchored: boolean;
}

/**
 * Shown under a selected relationship: a cardinality for each end (named after its entity),
 * the label, Reverse direction, Reset join points (when an end is fixed) and Delete. Changes
 * apply as they're made.
 */
export function EdgePopover({
  relationshipId,
  fromName,
  toName,
  fromCard,
  toCard,
  label,
  anchored,
}: Props) {
  const { apply, remove } = useErdEditor();
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
      <LabelField
        key={label}
        value={label}
        placeholder="e.g. owns"
        onCommit={(value) => update({ label: value.trim() })}
      />
      <div className="edge-popover-actions">
        <button
          type="button"
          className="btn btn-quiet btn-tight"
          onClick={() => apply((erd) => reverseRelationship(erd, relationshipId))}
        >
          Reverse direction
        </button>
        {anchored && (
          <button
            type="button"
            className="btn btn-quiet btn-tight"
            title="Let both ends find the nearest sides again"
            onClick={() => apply((erd) => clearRelationshipAnchors(erd, relationshipId))}
          >
            Reset join points
          </button>
        )}
        <button
          type="button"
          className="btn btn-quiet btn-tight edge-delete"
          onClick={() =>
            remove(
              (erd) => deleteRelationships(erd, [relationshipId]),
              (erd) => deletionSummary(erd, new Set(), new Set([relationshipId])),
            )
          }
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
