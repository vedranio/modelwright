import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Attribute, Entity } from '@modelwright/schema';
import { isEditing, useErdEditor } from './editor';
import { attributeDeletionSummary } from './deletion';
import { InlineField, type CommitReason } from '../editing/InlineField';
import {
  addAttribute,
  deleteAttribute,
  moveAttribute,
  renameEntity,
  setEntityDescription,
  updateAttribute,
} from './ops';

export type EntityNodeType = Node<
  {
    entity: Entity;
    /** One of the entities a hovered or selected relationship joins. */
    highlighted?: boolean;
  },
  'entity'
>;

const CONNECT_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

/**
 * An entity card: the name, an optional muted description, then one row per attribute with
 * its note beneath in faint text. Every text is edited in place: double-click it, then Enter
 * or click away to keep the change, Escape to drop it.
 */
export function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const { entity } = data;
  const { apply, editing, setEditing } = useErdEditor();
  const at = (kind: 'name' | 'description') => ({ kind, entityId: entity.id }) as const;
  const done = () => setEditing(null);

  const nameTarget = editing?.kind === 'name' && editing.entityId === entity.id ? editing : null;

  /** Opens a new, not-yet-saved attribute row after `after` (null: at the end). */
  const startDraft = (after: string | null) =>
    setEditing({ kind: 'draft', entityId: entity.id, after });

  /** A name can't be empty: an empty commit keeps the old one. */
  const commitName = (value: string) => {
    const name = value.trim();
    if (name) apply((erd) => renameEntity(erd, entity.id, name));
  };
  const commitDescription = (value: string) =>
    apply((erd) => setEntityDescription(erd, entity.id, value.trim()));

  const lastDraftAtEnd = isEditing(editing, { kind: 'draft', entityId: entity.id, after: null });

  return (
    <div className={`entity${data.highlighted ? ' highlighted' : ''}`}>
      {/* Floating edges compute their own endpoints; these only satisfy React Flow. */}
      <Handle type="target" position={Position.Top} className="anchor-handle" />
      <Handle type="source" position={Position.Top} className="anchor-handle" />
      {/* Drag from any side to another entity to relate them. Shown on hover. */}
      {CONNECT_SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side}
          className="connect-handle"
          title="Drag to another entity to relate them"
        />
      ))}

      <header className="entity-head">
        {nameTarget ? (
          <InlineField
            className="entity-name-input"
            ariaLabel="Entity name"
            value={entity.name}
            selectAll={nameTarget.selectAll ?? true}
            onCommit={(value) => {
              commitName(value);
              done();
            }}
            onTab={(value) => {
              commitName(value);
              setEditing(at('description'));
            }}
            onCancel={done}
          />
        ) : (
          <div
            className="entity-name editable"
            title={entity.name}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(at('name'));
            }}
          >
            {entity.name}
          </div>
        )}

        {isEditing(editing, at('description')) ? (
          <InlineField
            className="entity-description-input"
            ariaLabel="Entity description"
            placeholder="What this entity is"
            value={entity.description ?? ''}
            onCommit={(value) => {
              commitDescription(value);
              done();
            }}
            onTab={(value) => {
              commitDescription(value);
              startDraft(null);
            }}
            onCancel={done}
          />
        ) : entity.description ? (
          <p
            className="entity-description editable"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(at('description'));
            }}
          >
            {entity.description}
          </p>
        ) : (
          <button
            type="button"
            className="entity-affordance nodrag"
            onClick={() => setEditing(at('description'))}
          >
            + description
          </button>
        )}
      </header>

      <ul className="attributes">
        {entity.attributes
          .map((attribute) => (
            <AttributeRow
              key={attribute.id}
              entityId={entity.id}
              attribute={attribute}
              onEnter={() => startDraft(attribute.id)}
            />
          ))
          .flatMap((row, i) => {
            const after = entity.attributes[i]?.id ?? null;
            return isEditing(editing, { kind: 'draft', entityId: entity.id, after })
              ? [row, <DraftRow key="draft" entityId={entity.id} after={after} />]
              : [row];
          })}
        {lastDraftAtEnd && <DraftRow key="draft-end" entityId={entity.id} after={null} />}
      </ul>

      <button type="button" className="entity-add nodrag" onClick={() => startDraft(null)}>
        <span className="entity-add-plus" aria-hidden="true">
          +
        </span>
        Add attribute
      </button>
    </div>
  );
}

function AttributeRow({
  entityId,
  attribute,
  onEnter,
}: {
  entityId: string;
  attribute: Attribute;
  onEnter: () => void;
}) {
  const { apply, remove, editing, setEditing } = useErdEditor();
  const target = (kind: 'attribute' | 'note') =>
    ({ kind, entityId, attributeId: attribute.id }) as const;
  const done = () => setEditing(null);

  const commitName = (value: string, reason: CommitReason) => {
    const name = value.trim();
    // Clearing a name doesn't delete the attribute; that's what × is for.
    if (name) apply((erd) => updateAttribute(erd, entityId, attribute.id, { name }));
    if (name && reason === 'enter') onEnter();
    else done();
  };

  const saveNote = (value: string) =>
    apply((erd) => updateAttribute(erd, entityId, attribute.id, { note: value.trim() }));
  const commitNote = (value: string) => {
    saveNote(value);
    done();
  };

  return (
    <li className="attribute">
      <div className="attribute-line">
        {isEditing(editing, target('attribute')) ? (
          <InlineField
            ariaLabel="Attribute name"
            value={attribute.name}
            selectAll
            onCommit={commitName}
            onTab={(value) => {
              const name = value.trim();
              if (name) apply((erd) => updateAttribute(erd, entityId, attribute.id, { name }));
              setEditing(target('note'));
            }}
            onMove={(value, offset) => {
              const name = value.trim();
              if (name) apply((erd) => updateAttribute(erd, entityId, attribute.id, { name }));
              apply((erd) => moveAttribute(erd, entityId, attribute.id, offset));
            }}
            onCancel={done}
          />
        ) : (
          <span
            className="attribute-name editable"
            title={attribute.name}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(target('attribute'));
            }}
          >
            {attribute.name || ' '}
          </span>
        )}
        <span className="attribute-actions">
          {!attribute.note && !isEditing(editing, target('note')) && (
            <button
              type="button"
              className="attribute-action nodrag"
              title="Add a note"
              onClick={() => setEditing(target('note'))}
            >
              note
            </button>
          )}
          <button
            type="button"
            className="attribute-action attribute-delete nodrag"
            aria-label={`Delete ${attribute.name || 'attribute'}`}
            title="Delete attribute"
            onClick={() =>
              remove(
                (erd) => deleteAttribute(erd, entityId, attribute.id),
                (erd) => attributeDeletionSummary(erd, entityId, attribute.id),
              )
            }
          >
            ×
          </button>
        </span>
      </div>
      {isEditing(editing, target('note')) ? (
        <InlineField
          className="attribute-note-input"
          ariaLabel="Attribute note"
          placeholder="Note"
          value={attribute.note ?? ''}
          onCommit={commitNote}
          onTab={(value) => {
            saveNote(value);
            onEnter();
          }}
          onCancel={done}
        />
      ) : (
        attribute.note && (
          <span
            className="attribute-note editable"
            title={attribute.note}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(target('note'));
            }}
          >
            {attribute.note}
          </span>
        )
      )}
    </li>
  );
}

/**
 * A new attribute being typed. It only enters the document once it has a name, so nothing
 * empty is ever saved. Enter adds it and opens the next one below; Enter on an empty row, or
 * Escape, ends entry.
 */
function DraftRow({ entityId, after }: { entityId: string; after: string | null }) {
  const { apply, setEditing } = useErdEditor();

  const commit = (value: string, reason: CommitReason) => {
    const name = value.trim();
    if (!name) return setEditing(null);
    let added: string | null = null;
    apply((erd) => {
      const result = addAttribute(erd, entityId, after ?? undefined);
      added = result.id;
      return result.id ? updateAttribute(result.erd, entityId, result.id, { name }) : erd;
    });
    if (added && reason === 'enter') setEditing({ kind: 'draft', entityId, after: added });
    else setEditing(null);
  };

  return (
    <li className="attribute">
      <div className="attribute-line">
        <InlineField
          ariaLabel="New attribute name"
          placeholder="attribute"
          value=""
          onCommit={commit}
          onCancel={() => setEditing(null)}
        />
      </div>
    </li>
  );
}
