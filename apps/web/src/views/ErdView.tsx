import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import type { Erd } from '@modelwright/schema';
import { Canvas } from '../canvas/Canvas';
import { useSelection } from '../canvas/useSelection';
import { EntityBox, type EntityBoxNode } from '../erd/EntityBox';
import { estimateEntitySize } from '../erd/metrics';
import { placeEntities } from '../erd/placement';
import '../erd/erd.css';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

const NODE_TYPES = { entity: EntityBox };

interface Props {
  projectPath: string;
  state: DocState<'erd'>;
  onReload: () => void;
}

export function ErdView({ projectPath, state, onReload }: Props) {
  return (
    <div className="view-fill">
      <DocStateView kind="erd" state={state} onReload={onReload}>
        {(erd) => <ErdCanvas projectPath={projectPath} erd={erd} />}
      </DocStateView>
    </div>
  );
}

function ErdCanvas({ projectPath, erd }: { projectPath: string; erd: Erd }) {
  const flow = useMemo(() => toFlow(erd), [erd]);
  const selection = useSelection();
  const nodes = useMemo(
    () => flow.nodes.map((n) => ({ ...n, selected: selection.selectedNodes.has(n.id) })),
    [flow, selection.selectedNodes],
  );
  const edges = useMemo(
    () => flow.edges.map((e) => ({ ...e, selected: selection.selectedEdges.has(e.id) })),
    [flow, selection.selectedEdges],
  );

  return (
    <Canvas<EntityBoxNode, Edge>
      viewportKey={`erd:${projectPath}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={selection.onNodesChange}
      onEdgesChange={selection.onEdgesChange}
      nodesDraggable={false}
      nodesConnectable={false}
      overlay={
        erd.entities.length === 0 && (
          <EmptyCard title="No entities yet">
            Entities are the data your app stores. Add one to start the diagram.
          </EmptyCard>
        )
      }
    />
  );
}

/** The document as React Flow nodes and edges. Unpositioned entities are placed in memory only. */
function toFlow(erd: Erd): { nodes: EntityBoxNode[]; edges: Edge[] } {
  const positions = placeEntities(erd, estimateEntitySize);
  const nodes = erd.entities.map((entity): EntityBoxNode => ({
    id: entity.id,
    type: 'entity',
    position: positions[entity.id] ?? { x: 0, y: 0 },
    data: { entity },
  }));
  const edges = erd.relationships.map((rel): Edge => ({
    id: rel.id,
    source: rel.from,
    target: rel.to,
    // Plain lines for now; crow's-foot markers and labels arrive with the real edges.
    type: 'straight',
  }));
  return { nodes, edges };
}
