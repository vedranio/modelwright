import type { TransitionFrom, TransitionTo } from '@modelwright/schema';
import { LabelField } from '../editing/LabelField';
import { deletionSummary } from './deletion';
import { useFlowsEditor } from './editor';
import { deleteTransitions, retargetTransition, updateTransition } from './ops';

/** A screen and its states, as the To list offers them. */
export interface TargetScreen {
  id: string;
  name: string;
  states: readonly { id: string; name: string }[];
}

interface Props {
  transitionId: string;
  /** e.g. "Login › Default › Sign in". */
  fromText: string;
  from: TransitionFrom;
  to: TransitionTo;
  /** Every screen in the design, in order. */
  screens: readonly TargetScreen[];
  label: string;
}

/**
 * A To option's value: the screen id alone for its default state (no `stateId`), or the screen
 * and state ids. Ids never contain a space.
 */
const targetValue = (to: TransitionTo) =>
  to.stateId === undefined ? to.screenId : `${to.screenId} ${to.stateId}`;

function parseTarget(value: string): TransitionTo {
  const [screenId = '', stateId] = value.split(' ');
  return stateId === undefined ? { screenId } : { screenId, stateId };
}

/**
 * Shown under a selected transition: where it comes from, where it goes (any screen, or any
 * state of one), its label, and Delete. Changes apply as they're made. The state the CTA sits
 * in is listed but can't be chosen: a transition can't lead back into it.
 */
export function TransitionPopover({ transitionId, fromText, from, to, screens, label }: Props) {
  const { apply, remove } = useFlowsEditor();
  const update = (changes: Parameters<typeof updateTransition>[2]) =>
    apply((flows) => updateTransition(flows, transitionId, changes));
  const ownState = (screen: TargetScreen, stateId: string | undefined) =>
    screen.id === from.screenId && (stateId ?? screen.states[0]?.id) === from.stateId;

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
          value={targetValue(to)}
          onChange={(e) =>
            apply((flows) => retargetTransition(flows, transitionId, parseTarget(e.target.value)))
          }
        >
          {screens.map((screen) => (
            <optgroup key={screen.id} label={screen.name || 'Untitled screen'}>
              <option value={screen.id} disabled={ownState(screen, undefined)}>
                {screen.name || 'Untitled screen'} (default state)
              </option>
              {screen.states
                // A one-state screen's state is its default; it's listed only if this
                // transition names it explicitly.
                .filter(
                  (s) =>
                    screen.states.length > 1 || (to.screenId === screen.id && to.stateId === s.id),
                )
                .map((s) => (
                  <option
                    key={s.id}
                    value={targetValue({ screenId: screen.id, stateId: s.id })}
                    disabled={ownState(screen, s.id)}
                  >
                    {screen.name || 'Untitled screen'} › {s.name}
                  </option>
                ))}
            </optgroup>
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
          onClick={() =>
            remove(
              (flows) => deleteTransitions(flows, [transitionId]),
              (flows) => deletionSummary(flows, new Set(), new Set([transitionId])),
            )
          }
        >
          Delete
        </button>
      </div>
    </div>
  );
}
