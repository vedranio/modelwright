import { useCallback, useState } from 'react';
import type { EdgeChange, NodeChange } from '@xyflow/react';

/**
 * Which nodes and edges are selected. Views derive their React Flow nodes and edges from the
 * document, so selection is kept here, by id, and merged in with `selected: isSelected(id)`.
 */
export function useSelection() {
  const [nodeIds, setNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [edgeIds, setEdgeIds] = useState<ReadonlySet<string>>(new Set());

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodeIds((ids) => applySelect(ids, changes)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdgeIds((ids) => applySelect(ids, changes)),
    [],
  );
  const clear = useCallback(() => {
    setNodeIds(new Set());
    setEdgeIds(new Set());
  }, []);
  /** Replaces the selection. */
  const select = useCallback((nodes: Iterable<string>, edges: Iterable<string>) => {
    setNodeIds(new Set(nodes));
    setEdgeIds(new Set(edges));
  }, []);

  return {
    selectedNodes: nodeIds,
    selectedEdges: edgeIds,
    onNodesChange,
    onEdgesChange,
    clear,
    select,
  };
}

function applySelect(
  ids: ReadonlySet<string>,
  changes: readonly (NodeChange | EdgeChange)[],
): ReadonlySet<string> {
  let next: Set<string> | null = null;
  for (const change of changes) {
    if (change.type !== 'select' || ids.has(change.id) === change.selected) continue;
    next ??= new Set(ids);
    if (change.selected) next.add(change.id);
    else next.delete(change.id);
  }
  return next ?? ids;
}
