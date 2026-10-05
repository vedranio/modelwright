import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Screen, ScreenState } from '@modelwright/schema';
import { SCREEN_HANDLE, ctaHandle, showsStateHeaders, stateHandle } from './endpoints';

export type ScreenNodeType = Node<
  {
    screen: Screen;
    /** `${stateId}:${ctaId}` of this screen's CTAs that have a transition from them. */
    connected: ReadonlySet<string>;
  },
  'screen'
>;

/**
 * A lo-fi screen card: the name and optional notes, then each state's "Sees" list (what the user
 * sees) and "Does" list (the CTAs they can use). A single-state screen hides its state header, so
 * the common case reads as just name / sees / does. Every CTA row has a source handle on the
 * card's right edge, filled when a transition starts from it and hollow when none does (a dead
 * end). The screen header and each shown state header have a target handle on the left edge.
 */
export function ScreenNode({ data }: NodeProps<ScreenNodeType>) {
  const { screen, connected } = data;
  const multi = showsStateHeaders(screen);
  return (
    <div className="screen">
      <div className="screen-head" data-screen-header="">
        <Handle
          type="target"
          id={SCREEN_HANDLE}
          position={Position.Left}
          className="target-handle"
        />
        <div className="screen-name">{screen.name}</div>
        {screen.notes && <div className="screen-notes">{screen.notes}</div>}
      </div>
      {screen.states.map((state, i) => (
        <StateSection
          key={state.id}
          state={state}
          isDefault={i === 0}
          showHeader={multi}
          connected={connected}
        />
      ))}
    </div>
  );
}

function StateSection({
  state,
  isDefault,
  showHeader,
  connected,
}: {
  state: ScreenState;
  isDefault: boolean;
  showHeader: boolean;
  connected: ReadonlySet<string>;
}) {
  return (
    <section className="screen-state">
      {showHeader && (
        <div className="state-head" data-state-header={state.id}>
          <Handle
            type="target"
            id={stateHandle(state.id)}
            position={Position.Left}
            className="target-handle"
          />
          <span className="state-name">{state.name}</span>
          {isDefault && <span className="state-tag">default</span>}
        </div>
      )}
      <div className="state-body">
        <div className="list-caption">Sees</div>
        {state.sees.length > 0 ? (
          <ul className="sees">
            {state.sees.map((item, i) => (
              <li key={i} className="sees-item">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <div className="list-empty">Nothing yet</div>
        )}
        <div className="list-caption">Does</div>
        {state.ctas.length > 0 ? (
          <ul className="ctas">
            {state.ctas.map((cta) => (
              <li key={cta.id} className="cta-row">
                <span className="cta-label">{cta.label}</span>
                <Handle
                  type="source"
                  id={ctaHandle(state.id, cta.id)}
                  position={Position.Right}
                  className={`cta-handle${connected.has(`${state.id}:${cta.id}`) ? ' connected' : ''}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="list-empty">Nothing yet</div>
        )}
      </div>
    </section>
  );
}
