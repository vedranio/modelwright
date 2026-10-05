import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Screen } from '@modelwright/schema';

export type ScreenNodeType = Node<{ screen: Screen }, 'screen'>;

/** A screen card. For now a simple read-only box: the name and its states. */
export function ScreenNode({ data }: NodeProps<ScreenNodeType>) {
  const { screen } = data;
  return (
    <div className="screen">
      <Handle type="target" position={Position.Left} className="anchor-handle" />
      <Handle type="source" position={Position.Right} className="anchor-handle" />
      <div className="screen-head">
        <div className="screen-name">{screen.name}</div>
      </div>
      <ul className="screen-states">
        {screen.states.map((s) => (
          <li key={s.id}>{s.name}</li>
        ))}
      </ul>
    </div>
  );
}
