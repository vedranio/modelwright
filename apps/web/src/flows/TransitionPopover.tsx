import { LabelField } from '../editing/LabelField';
import { useFlowsEditor } from './editor';
import { deleteTransitions, updateTransition } from './ops';

interface Props {
  transitionId: string;
  /** e.g. "Login › Default › Sign in". */
  fromText: string;
  toScreenName: string;
  toStates: readonly { id: string; name: string }[];
  /** The explicitly targeted state; undefined means the screen's default state. */
  toStateId: string | undefined;
  label: string;
}

/** The select value standing for "the default state" (no `stateId`). */
const DEFAULT_TARGET = '';

/**
 * Shown under a selected transition: where it comes from, which state of the target screen it
 * goes to, its label, and Delete. Changes apply as they're made. The target screen itself can't
 * be changed here; delete the transition and draw a new one.
 */
export function TransitionPopover({
  transitionId,
  fromText,
  toScreenName,
  toStates,
  toStateId,
  label,
}: Props) {
  const { apply } = useFlowsEditor();
  const update = (changes: Parameters<typeof updateTransition>[2]) =>
    apply((flows) => updateTransition(flows, transitionId, changes));

  return (
    <div
      className="edge-popover nodrag nowheel nopan"
      role="dialog"
      aria-label="Transition"
      // Clicks inside the popover mustn't reach the canvas and clear the selection.
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="edge-field">
        <span className="edge-field-label">From</span>
        <span className="transition-from" title={fromText}>
          {fromText}
        </span>
      </div>
      <label className="edge-field">
        <span className="edge-field-label">To</span>
        <select
          className="edge-select"
          value={toStateId ?? DEFAULT_TARGET}
          onChange={(e) =>
            update({ stateId: e.target.value === DEFAULT_TARGET ? null : e.target.value })
          }
        >
          <option value={DEFAULT_TARGET}>{toScreenName} (default state)</option>
          {toStates.map((s) => (
            <option key={s.id} value={s.id}>
              {toScreenName} › {s.name}
            </option>
          ))}
        </select>
      </label>
      <LabelField
        key={label}
        value={label}
        placeholder="e.g. success"
        onCommit={(value) => update({ label: value.trim() })}
      />
      <div className="edge-popover-actions">
        <span />
        <button
          type="button"
          className="btn btn-quiet btn-tight edge-delete"
          onClick={() => apply((flows) => deleteTransitions(flows, [transitionId]))}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
