import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Entity } from '@modelwright/schema';

export type EntityBoxNode = Node<{ entity: Entity }, 'entity'>;

/**
 * Milestone 1's read-only stand-in for the entity card: the name and attribute names. The hidden
 * handles only anchor the plain edges until floating edges replace them.
 */
export function EntityBox({ data }: NodeProps<EntityBoxNode>) {
  return (
    <div className="entity-box">
      <Handle type="target" position={Position.Left} className="hidden-handle" />
      <div className="entity-box-name">{data.entity.name}</div>
      {data.entity.attributes.length > 0 && (
        <ul className="entity-box-attrs">
          {data.entity.attributes.map((a) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
      )}
      <Handle type="source" position={Position.Right} className="hidden-handle" />
    </div>
  );
}
