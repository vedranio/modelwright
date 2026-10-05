import { useMemo } from 'react';
import type { Erd } from '@modelwright/schema';
import { Canvas } from '../canvas/Canvas';
import { useSelection } from '../canvas/useSelection';
import { CrowsFootEdge, type CrowsFootEdgeType } from '../erd/CrowsFootEdge';
import { parallelOffsets } from '../erd/edgeGeometry';
import { EntityNode, type EntityNodeType } from '../erd/EntityNode';
import { estimateEntitySize } from '../erd/metrics';
import { placeEntities } from '../erd/placement';
import '../erd/erd.css';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

const NODE_TYPES = { entity: EntityNode };
const EDGE_TYPES = { crowsfoot: CrowsFootEdge };

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
    <Canvas<EntityNodeType, CrowsFootEdgeType>
      viewportKey={`erd:${projectPath}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
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
function toFlow(erd: Erd): { nodes: EntityNodeType[]; edges: CrowsFootEdgeType[] } {
  const positions = placeEntities(erd, estimateEntitySize);
  const nodes = erd.entities.map((entity): EntityNodeType => ({
    id: entity.id,
    type: 'entity',
    position: positions[entity.id] ?? { x: 0, y: 0 },
    data: { entity },
  }));
  const offsets = parallelOffsets(erd.relationships);
  const edges = erd.relationships.map((rel): CrowsFootEdgeType => ({
    id: rel.id,
    source: rel.from,
    target: rel.to,
    type: 'crowsfoot',
    data: {
      fromCard: rel.fromCard,
      toCard: rel.toCard,
      offset: offsets.get(rel.id) ?? 0,
      ...(rel.label !== undefined && { label: rel.label }),
    },
  }));
  return { nodes, edges };
}
