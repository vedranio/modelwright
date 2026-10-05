import { useCallback, useState } from 'react';
import type { NodeChange } from '@xyflow/react';

type Size = { width: number; height: number };

/**
 * Node sizes as React Flow measured them. Views derive fresh node objects from the document
 * on every change; without their `measured` size, React Flow treats them as new and hides them
 * until it measures again. For that frame a click falls through to the pane, which breaks
 * double-click. Merge `measured` back in from `sizes`.
 */
export function useMeasurements() {
  const [sizes, setSizes] = useState<ReadonlyMap<string, Size>>(new Map());

  const onNodesChange = useCallback((changes: readonly NodeChange[]) => {
    setSizes((current) => {
      let next: Map<string, Size> | null = null;
      for (const c of changes) {
        if (c.type !== 'dimensions' || !c.dimensions) continue;
        const old = current.get(c.id);
        if (old && old.width === c.dimensions.width && old.height === c.dimensions.height) continue;
        next ??= new Map(current);
        next.set(c.id, c.dimensions);
      }
      return next ?? current;
    });
  }, []);

  return { onNodesChange, sizes };
}
