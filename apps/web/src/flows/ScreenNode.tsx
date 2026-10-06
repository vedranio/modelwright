import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Cta, Screen, ScreenState } from '@modelwright/schema';
import { InlineField } from '../editing/InlineField';
import { isEditing, useFlowsEditor, type EditTarget } from './editor';
import { ctaDeletionSummary, seesDeletionSummary, stateDeletionSummary } from './deletion';
import { SCREEN_HANDLE, ctaHandle, showsStateHeaders, stateHandle } from './endpoints';
import {
  addCta,
  addSeesItem,
  addState,
  deleteCta,
  deleteSeesItem,
  deleteState,
  makeDefaultState,
  renameCta,
  renameScreen,
  renameState,
  setScreenNotes,
  updateSeesItem,
} from './ops';
import {
  afterCta,
  afterSees,
  afterSeesDraft,
  ctaStart,
  nextStateStart,
  seesStart,
} from './tabOrder';

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
 *
 * Every text is edited in place: double-click it, then Enter or click away to keep the change,
 * Escape to drop it, Tab to move on through the card.
 */
export function ScreenNode({ data }: NodeProps<ScreenNodeType>) {
  const { screen, connected } = data;
  const { apply, editing, setEditing } = useFlowsEditor();
  const multi = showsStateHeaders(screen);
  const at = (kind: 'name' | 'notes') => ({ kind, screenId: screen.id }) as const;
  const done = () => setEditing(null);

  const nameTarget = editing?.kind === 'name' && editing.screenId === screen.id ? editing : null;

  /** A name can't be empty: an empty commit keeps the old one. */
  const commitName = (value: string) => {
    const name = value.trim();
    if (name) apply((f) => renameScreen(f, screen.id, name));
  };
  const commitNotes = (value: string) => apply((f) => setScreenNotes(f, screen.id, value.trim()));

  /** Appends a state and opens its name for typing. */
  const addStateAtEnd = () => {
    let id: string | null = null;
    apply((f) => {
      const result = addState(f, screen.id);
      id = result.id;
      return result.flows;
    });
    if (id) setEditing({ kind: 'stateName', screenId: screen.id, stateId: id, selectAll: true });
  };

  return (
    <div className="screen">
      <header className="screen-head" data-screen-header="">
        <Handle
          type="target"
          id={SCREEN_HANDLE}
          position={Position.Left}
          className="target-handle"
        />
        {nameTarget ? (
          <InlineField
            className="screen-name-input"
            ariaLabel="Screen name"
            value={screen.name}
            selectAll={nameTarget.selectAll ?? true}
            onCommit={(value) => {
              commitName(value);
              done();
            }}
            onTab={(value) => {
              commitName(value);
              setEditing(at('notes'));
            }}
            onCancel={done}
          />
        ) : (
          <div
            className="screen-name editable"
            title={screen.name}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(at('name'));
            }}
          >
            {screen.name}
          </div>
        )}

        {isEditing(editing, at('notes')) ? (
          <InlineField
            className="screen-notes-input"
            ariaLabel="Screen notes"
            placeholder="Notes"
            value={screen.notes ?? ''}
            onCommit={(value) => {
              commitNotes(value);
              done();
            }}
            onTab={(value) => {
              commitNotes(value);
              setEditing(seesStart(screen, 0));
            }}
            onCancel={done}
          />
        ) : (
          screen.notes && (
            <p
              className="screen-notes editable"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(at('notes'));
              }}
            >
              {screen.notes}
            </p>
          )
        )}

        {/* Hover controls at the header's right, taking no space. */}
        {!nameTarget && (
          <span className="screen-affordances">
            {!screen.notes && !isEditing(editing, at('notes')) && (
              <button
                type="button"
                className="card-affordance nodrag"
                onClick={() => setEditing(at('notes'))}
              >
                + notes
              </button>
            )}
            <button type="button" className="card-affordance nodrag" onClick={addStateAtEnd}>
              + state
            </button>
          </span>
        )}
      </header>

      {screen.states.map((state, i) => (
        <StateSection
          key={state.id}
          screen={screen}
          state={state}
          stateIndex={i}
          showHeader={multi}
          connected={connected}
        />
      ))}
    </div>
  );
}

function StateSection({
  screen,
  state,
  stateIndex,
  showHeader,
  connected,
}: {
  screen: Screen;
  state: ScreenState;
  stateIndex: number;
  showHeader: boolean;
  connected: ReadonlySet<string>;
}) {
  const { apply, remove, editing, setEditing } = useFlowsEditor();
  const ids = { screenId: screen.id, stateId: state.id };
  const isDefault = stateIndex === 0;
  const nameTarget =
    editing?.kind === 'stateName' && editing.screenId === screen.id && editing.stateId === state.id
      ? editing
      : null;

  const commitName = (value: string) => {
    const name = value.trim();
    if (name) apply((f) => renameState(f, screen.id, state.id, name));
  };

  const seesDraftAt = (after: number | null) =>
    isEditing(editing, { kind: 'seesDraft', ...ids, after });
  const ctaDraftAt = (after: string | null) =>
    isEditing(editing, { kind: 'ctaDraft', ...ids, after });

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
          {nameTarget ? (
            <InlineField
              className="state-name-input"
              ariaLabel="State name"
              value={state.name}
              selectAll={nameTarget.selectAll ?? true}
              onCommit={(value) => {
                commitName(value);
                setEditing(null);
              }}
              onTab={(value) => {
                commitName(value);
                setEditing(seesStart(screen, stateIndex));
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <span
              className="state-name editable"
              title={state.name}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing({ kind: 'stateName', ...ids });
              }}
            >
              {state.name}
            </span>
          )}
          {isDefault && <span className="state-tag">default</span>}
          {!nameTarget && (
            <span className="row-actions">
              {!isDefault && (
                <button
                  type="button"
                  className="row-action nodrag"
                  title="Make this the default state"
                  onClick={() => apply((f) => makeDefaultState(f, screen.id, state.id))}
                >
                  make default
                </button>
              )}
              <button
                type="button"
                className="row-action row-delete nodrag"
                aria-label={`Delete the ${state.name} state`}
                title="Delete state"
                onClick={() =>
                  remove(
                    (f) => deleteState(f, screen.id, state.id),
                    (f) => stateDeletionSummary(f, screen.id, state.id),
                  )
                }
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}

      <div className="state-body">
        <div className="list-caption">Sees</div>
        <ul className="sees">
          {state.sees.flatMap((item, i) => {
            const row = (
              <SeesRow
                key={i}
                screen={screen}
                state={state}
                stateIndex={stateIndex}
                index={i}
                item={item}
              />
            );
            return seesDraftAt(i)
              ? [row, <SeesDraft key="draft" screen={screen} stateIndex={stateIndex} after={i} />]
              : [row];
          })}
          {seesDraftAt(null) && (
            <SeesDraft key="draft-end" screen={screen} stateIndex={stateIndex} after={null} />
          )}
        </ul>
        <AddRow
          label="Add item"
          onClick={() => setEditing({ kind: 'seesDraft', ...ids, after: null })}
        />

        <div className="list-caption">Does</div>
        <ul className="ctas">
          {state.ctas.flatMap((cta) => {
            const row = (
              <CtaRow
                key={cta.id}
                screen={screen}
                state={state}
                stateIndex={stateIndex}
                cta={cta}
                connected={connected.has(`${state.id}:${cta.id}`)}
              />
            );
            return ctaDraftAt(cta.id)
              ? [
                  row,
                  <CtaDraft key="draft" screen={screen} stateIndex={stateIndex} after={cta.id} />,
                ]
              : [row];
          })}
          {ctaDraftAt(null) && (
            <CtaDraft key="draft-end" screen={screen} stateIndex={stateIndex} after={null} />
          )}
        </ul>
        <AddRow
          label="Add CTA"
          onClick={() => setEditing({ kind: 'ctaDraft', ...ids, after: null })}
        />
      </div>
    </section>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="list-add nodrag" onClick={onClick}>
      <span className="list-add-plus" aria-hidden="true">
        +
      </span>
      {label}
    </button>
  );
}

interface RowProps {
  screen: Screen;
  state: ScreenState;
  stateIndex: number;
}

function SeesRow({
  screen,
  state,
  stateIndex,
  index,
  item,
}: RowProps & { index: number; item: string }) {
  const { apply, remove, editing, setEditing } = useFlowsEditor();
  const target: EditTarget = { kind: 'sees', screenId: screen.id, stateId: state.id, index };

  /** Clearing an item doesn't delete it; that's what × is for. */
  const save = (value: string) => {
    const text = value.trim();
    if (text) apply((f) => updateSeesItem(f, screen.id, state.id, index, text));
    return text;
  };

  return (
    <li className="sees-item">
      {isEditing(editing, target) ? (
        <InlineField
          ariaLabel="Sees item"
          value={item}
          selectAll
          onCommit={(value, reason) => {
            const text = save(value);
            setEditing(
              text && reason === 'enter'
                ? { kind: 'seesDraft', screenId: screen.id, stateId: state.id, after: index }
                : null,
            );
          }}
          onTab={(value) => {
            save(value);
            setEditing(afterSees(screen, stateIndex, index));
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <span
          className="sees-text editable"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(target);
          }}
        >
          {item || ' '}
        </span>
      )}
      <span className="row-actions">
        <button
          type="button"
          className="row-action row-delete nodrag"
          aria-label={`Delete ${item || 'item'}`}
          title="Delete item"
          onClick={() =>
            remove(
              (f) => deleteSeesItem(f, screen.id, state.id, index),
              (f) => seesDeletionSummary(f, screen.id, state.id, index),
            )
          }
        >
          ×
        </button>
      </span>
    </li>
  );
}

/**
 * A new sees item being typed. It only enters the document once it has text. Enter adds it and
 * opens the next one below; Enter on an empty row, Escape or clicking away ends entry. Tab adds
 * it (if it has text) and moves on, to the CTAs once past the last item.
 */
function SeesDraft({
  screen,
  stateIndex,
  after,
}: {
  screen: Screen;
  stateIndex: number;
  after: number | null;
}) {
  const { apply, setEditing } = useFlowsEditor();
  const state = screen.states[stateIndex] as ScreenState;

  const add = (text: string): number | null => {
    let index: number | null = null;
    apply((f) => {
      const result = addSeesItem(f, screen.id, state.id, after ?? undefined, text);
      index = result.index;
      return result.flows;
    });
    return index;
  };

  return (
    <li className="sees-item">
      <InlineField
        ariaLabel="New sees item"
        placeholder="what the user sees"
        value=""
        onCommit={(value, reason) => {
          const text = value.trim();
          if (!text) return setEditing(null);
          const index = add(text);
          setEditing(
            index !== null && reason === 'enter'
              ? { kind: 'seesDraft', screenId: screen.id, stateId: state.id, after: index }
              : null,
          );
        }}
        onTab={(value) => {
          const text = value.trim();
          if (!text) return setEditing(ctaStart(screen, stateIndex));
          add(text);
          setEditing(afterSeesDraft(screen, stateIndex, after));
        }}
        onCancel={() => setEditing(null)}
      />
    </li>
  );
}

function CtaRow({
  screen,
  state,
  stateIndex,
  cta,
  connected,
}: RowProps & { cta: Cta; connected: boolean }) {
  const { apply, remove, editing, setEditing } = useFlowsEditor();
  const target: EditTarget = { kind: 'cta', screenId: screen.id, stateId: state.id, ctaId: cta.id };

  /** Clearing a label doesn't delete the CTA; that's what × is for. */
  const save = (value: string) => {
    const label = value.trim();
    if (label) apply((f) => renameCta(f, screen.id, state.id, cta.id, label));
    return label;
  };

  return (
    <li className="cta-row">
      {isEditing(editing, target) ? (
        <InlineField
          ariaLabel="CTA label"
          value={cta.label}
          selectAll
          onCommit={(value, reason) => {
            const label = save(value);
            setEditing(
              label && reason === 'enter'
                ? { kind: 'ctaDraft', screenId: screen.id, stateId: state.id, after: cta.id }
                : null,
            );
          }}
          onTab={(value) => {
            save(value);
            setEditing(afterCta(screen, stateIndex, cta.id));
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <span
          className="cta-label editable"
          title={cta.label}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(target);
          }}
        >
          {cta.label || ' '}
        </span>
      )}
      <span className="row-actions">
        <button
          type="button"
          className="row-action row-delete nodrag"
          aria-label={`Delete ${cta.label || 'CTA'}`}
          title="Delete CTA"
          onClick={() =>
            remove(
              (f) => deleteCta(f, screen.id, state.id, cta.id),
              (f) => ctaDeletionSummary(f, screen.id, state.id, cta.id),
            )
          }
        >
          ×
        </button>
      </span>
      <Handle
        type="source"
        id={ctaHandle(state.id, cta.id)}
        position={Position.Right}
        className={`cta-handle${connected ? ' connected' : ''}`}
      />
    </li>
  );
}

/** A new CTA being typed; it behaves like a new sees item. Tab past the last CTA goes to the next state. */
function CtaDraft({
  screen,
  stateIndex,
  after,
}: {
  screen: Screen;
  stateIndex: number;
  after: string | null;
}) {
  const { apply, setEditing } = useFlowsEditor();
  const state = screen.states[stateIndex] as ScreenState;

  const add = (label: string): string | null => {
    let id: string | null = null;
    apply((f) => {
      const result = addCta(f, screen.id, state.id, after ?? undefined, label);
      id = result.id;
      return result.flows;
    });
    return id;
  };

  return (
    <li className="cta-row">
      <InlineField
        ariaLabel="New CTA label"
        placeholder="what the user can do"
        value=""
        onCommit={(value, reason) => {
          const label = value.trim();
          if (!label) return setEditing(null);
          const id = add(label);
          setEditing(
            id && reason === 'enter'
              ? { kind: 'ctaDraft', screenId: screen.id, stateId: state.id, after: id }
              : null,
          );
        }}
        onTab={(value) => {
          const label = value.trim();
          if (label) add(label);
          setEditing(
            label ? afterCta(screen, stateIndex, after) : nextStateStart(screen, stateIndex),
          );
        }}
        onCancel={() => setEditing(null)}
      />
    </li>
  );
}
