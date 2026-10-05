import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Entity } from '@modelwright/schema';

export type EntityNodeType = Node<{ entity: Entity }, 'entity'>;

/**
 * An entity card: the name, an optional muted description, then one row per attribute with
 * its note beneath in faint text. Read-only for now; inline editing arrives with milestone 4.
 */
export function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const { entity } = data;
  return (
    <div className="entity">
      {/* Floating edges compute their own endpoints; these only satisfy React Flow. */}
      <Handle type="target" position={Position.Top} className="anchor-handle" />
      <Handle type="source" position={Position.Top} className="anchor-handle" />

      <header className="entity-head">
        <div className="entity-name" title={entity.name}>
          {entity.name}
        </div>
        {entity.description && <p className="entity-description">{entity.description}</p>}
      </header>

      {entity.attributes.length === 0 ? (
        <p className="entity-empty">No attributes</p>
      ) : (
        <ul className="attributes">
          {entity.attributes.map((a) => (
            <li key={a.id} className="attribute">
              <span className="attribute-name" title={a.name}>
                {a.name || ' '}
              </span>
              {a.note && (
                <span className="attribute-note" title={a.note}>
                  {a.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
