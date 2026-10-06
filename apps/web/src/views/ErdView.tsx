import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { NodeChange, OnConnectEnd, ReactFlowInstance, XYPosition } from '@xyflow/react';
import type { Erd } from '@modelwright/schema';
import { Canvas } from '../canvas/Canvas';
import { useMeasurements } from '../canvas/useMeasurements';
import { useSelection } from '../canvas/useSelection';
import { SaveStatusPill } from '../editing/SaveStatusPill';
import { touchedErd } from '../editing/touched';
import { useCanvasHistory } from '../editing/useCanvasHistory';
import type { EditableDoc } from '../editing/useEditableDoc';
import { CrowsFootEdge, type CrowsFootEdgeType } from '../erd/CrowsFootEdge';
import { deletionSummary } from '../erd/deletion';
import { parallelOffsets } from '../erd/edgeGeometry';
import { ErdEditorContext, type EditTarget, type ErdEditor } from '../erd/editor';
import { EntityNode, type EntityNodeType } from '../erd/EntityNode';
import { ENTITY_WIDTH, estimateEntitySize } from '../erd/metrics';
import {
  addEntity,
  addRelationship,
  deleteEntities,
  deleteRelationships,
  moveEntities,
} from '../erd/ops';
import { placeEntities } from '../erd/placement';
import '../erd/erd.css';
import { useShortcut } from '../shortcuts';
import { Kbd } from '../ui';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

const NODE_TYPES = { entity: EntityNode };
const EDGE_TYPES = { crowsfoot: CrowsFootEdge };

/** Where a new entity's top-left sits relative to the point it's created at. */
const NEW_ENTITY_OFFSET = { x: -ENTITY_WIDTH / 2, y: -20 };

interface Props {
  projectPath: string;
  state: DocState<'erd'>;
  edit: EditableDoc<'erd'>;
  onReload: () => void;
}

export function ErdView({ projectPath, state, edit, onReload }: Props) {
  return (
    <div className="view-fill">
      <DocStateView kind="erd" state={state} onReload={onReload}>
        {(onDisk) => <ErdCanvas projectPath={projectPath} erd={edit.doc ?? onDisk} edit={edit} />}
      </DocStateView>
    </div>
  );
}

function ErdCanvas({
  projectPath,
  erd,
  edit,
}: {
  projectPath: string;
  erd: Erd;
  edit: EditableDoc<'erd'>;
}) {
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [dragging, setDragging] = useState<Record<string, XYPosition>>({});
  const selection = useSelection();
  const measurements = useMeasurements();
  const instance = useRef<ReactFlowInstance<EntityNodeType, CrowsFootEdgeType> | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const { apply: applyDoc } = edit;
  /**
   * Applies an ERD operation. Entities shown at computed positions get those positions written
   * with the first real edit, so nothing moves when the file is next read.
   */
  const apply = useCallback<ErdEditor['apply']>(
    (op, options) =>
      applyDoc((doc) => {
        const placed = withPlacement(doc);
        const next = op(placed);
        return next === placed ? doc : next;
      }, options),
    [applyDoc],
  );

  const history = useCanvasHistory('erd', edit, touchedErd, selection.select);
  const { remove: removeDoc } = history;
  const remove = useCallback<ErdEditor['remove']>(
    (op, describe) => removeDoc(op, describe, apply),
    [removeDoc, apply],
  );

  const editor = useMemo<ErdEditor>(
    () => ({ apply, remove, editing, setEditing }),
    [apply, remove, editing],
  );

  const flow = useMemo(() => toFlow(erd), [erd]);
  const nodes = useMemo(
    () =>
      flow.nodes.map((n) => {
        const measured = measurements.sizes.get(n.id);
        return {
          ...n,
          position: dragging[n.id] ?? n.position,
          selected: selection.selectedNodes.has(n.id),
          ...(measured && { measured }),
        };
      }),
    [flow, dragging, selection.selectedNodes, measurements.sizes],
  );
  const edges = useMemo(() => {
    // The popover shows when one relationship, and nothing else, is selected. Only count what
    // still exists: a deleted item's id can linger in the selection.
    const selectedEdges = flow.edges.filter((e) => selection.selectedEdges.has(e.id));
    const anyNodeSelected = flow.nodes.some((n) => selection.selectedNodes.has(n.id));
    const lone = !anyNodeSelected && selectedEdges.length === 1 ? selectedEdges[0]?.id : null;
    return flow.edges.map((e) => ({
      ...e,
      selected: selection.selectedEdges.has(e.id),
      ...(e.data && { data: { ...e.data, editing: e.id === lone } }),
    }));
  }, [flow, selection.selectedEdges, selection.selectedNodes]);

  /**
   * Dropping a connection anywhere on another entity relates the two, with the default
   * cardinalities. Dropping on the same entity, or on empty canvas, does nothing.
   */
  const onConnectEnd: OnConnectEnd = (event, connection) => {
    const from = connection.fromNode?.id;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!from || !point) return;
    const to = document
      .elementFromPoint(point.clientX, point.clientY)
      ?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
    if (!to || to === from) return;
    let id: string | null = null;
    apply((doc) => {
      const result = addRelationship(doc, from, to);
      id = result.id;
      return result.erd;
    });
    if (id) {
      selection.clear();
      selection.onEdgesChange([{ type: 'select', id, selected: true }]);
    }
  };

  const onNodesChange = (changes: NodeChange<EntityNodeType>[]) => {
    selection.onNodesChange(changes);
    measurements.onNodesChange(changes);
    // Positions move live while dragging; the document changes once, on drop.
    const moved: Record<string, XYPosition> = {};
    for (const c of changes) {
      if (c.type === 'position' && c.dragging && c.position) moved[c.id] = c.position;
    }
    if (Object.keys(moved).length > 0) setDragging((d) => ({ ...d, ...moved }));
  };

  /** Adds an entity with its top-left near `at`, and opens its name for typing. */
  const createEntity = (at: XYPosition) => {
    let id: string | null = null;
    apply((doc) => {
      const result = addEntity(doc, {
        x: at.x + NEW_ENTITY_OFFSET.x,
        y: at.y + NEW_ENTITY_OFFSET.y,
      });
      id = result.id;
      return result.erd;
    });
    if (id) {
      selection.clear();
      setEditing({ kind: 'name', entityId: id, selectAll: true });
    }
  };

  const addAtCentre = () => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect || !instance.current) return;
    createEntity(
      instance.current.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }),
    );
  };

  const onDoubleClick = (e: MouseEvent) => {
    // Only on empty canvas: double-clicks on cards edit their text.
    if (!(e.target instanceof Element) || !e.target.classList.contains('react-flow__pane')) return;
    if (!instance.current) return;
    createEntity(instance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  useShortcut(
    (e) => e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey,
    (e) => {
      e.preventDefault();
      addAtCentre();
    },
  );
  useShortcut(
    (e) => e.key === 'Escape',
    () => selection.clear(),
  );

  return (
    <ErdEditorContext.Provider value={editor}>
      <div ref={container} className="canvas-host" onDoubleClick={onDoubleClick}>
        <Canvas<EntityNodeType, CrowsFootEdgeType>
          viewportKey={`erd:${projectPath}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onInit={(i) => {
            instance.current = i;
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={selection.onEdgesChange}
          onNodeDragStop={(_e, _node, dragged) => {
            apply(
              (doc) =>
                moveEntities(doc, Object.fromEntries(dragged.map((n) => [n.id, n.position]))),
              { saveNow: true },
            );
            setDragging({});
          }}
          onConnectEnd={onConnectEnd}
          // Only dropping onto an entity counts (onConnectEnd); never connect handle to handle.
          isValidConnection={() => false}
          onBeforeDelete={({ nodes: goneNodes, edges: goneEdges }) => {
            // No confirmation: the toast offers Undo (decisions.md, phase 5).
            const entityIds = new Set(goneNodes.map((n) => n.id));
            const relationshipIds = new Set(goneEdges.map((e) => e.id));
            remove(
              (doc) => deleteRelationships(deleteEntities(doc, entityIds), relationshipIds),
              (doc) => deletionSummary(doc, entityIds, relationshipIds),
            );
            selection.clear();
            // The document change removes them; React Flow mustn't remove them a second time.
            return Promise.resolve(false);
          }}
          toolbarActions={
            <button
              type="button"
              className="btn btn-quiet btn-tight toolbar-add"
              onClick={addAtCentre}
            >
              <span className="toolbar-add-plus" aria-hidden="true">
                +
              </span>
              Add entity
              <Kbd>E</Kbd>
            </button>
          }
          status={
            <SaveStatusPill
              status={edit.status}
              issues={edit.issues}
              onRetry={() => void edit.flush()}
            />
          }
          overlay={
            erd.entities.length === 0 && (
              <EmptyCard
                title="No entities yet"
                actions={
                  <button type="button" className="btn btn-primary" onClick={addAtCentre}>
                    Add entity
                    <Kbd>E</Kbd>
                  </button>
                }
              >
                Entities are the data your app stores. Add one to start the diagram.
              </EmptyCard>
            )
          }
        />
      </div>
    </ErdEditorContext.Provider>
  );
}

/** The document with every entity positioned: computed spots filled in for any without one. */
function withPlacement(erd: Erd): Erd {
  if (erd.entities.every((e) => erd.layout[e.id])) return erd;
  const placed = placeEntities(erd, estimateEntitySize);
  const missing = Object.fromEntries(
    erd.entities
      .filter((e) => !erd.layout[e.id])
      .map((e) => [e.id, placed[e.id] ?? { x: 0, y: 0 }]),
  );
  return moveEntities(erd, missing);
}

/** The document as React Flow nodes and edges. Unpositioned entities are placed in memory only. */
function toFlow(erd: Erd): { nodes: EntityNodeType[]; edges: CrowsFootEdgeType[] } {
  const positions = placeEntities(erd, estimateEntitySize);
  const nodes = erd.entities.map((entity): EntityNodeType => {
    // An initial size lets React Flow show a new card at once instead of hiding it until
    // measured, so its name field can take focus straight away.
    const size = estimateEntitySize(entity);
    return {
      id: entity.id,
      type: 'entity',
      position: positions[entity.id] ?? { x: 0, y: 0 },
      data: { entity },
      initialWidth: size.width,
      initialHeight: size.height,
    };
  });
  const offsets = parallelOffsets(erd.relationships);
  const names = new Map(erd.entities.map((e) => [e.id, e.name]));
  const edges = erd.relationships.map((rel): CrowsFootEdgeType => ({
    id: rel.id,
    source: rel.from,
    target: rel.to,
    type: 'crowsfoot',
    data: {
      fromCard: rel.fromCard,
      toCard: rel.toCard,
      offset: offsets.get(rel.id) ?? 0,
      fromName: names.get(rel.from) ?? rel.from,
      toName: names.get(rel.to) ?? rel.to,
      editing: false,
      ...(rel.label !== undefined && { label: rel.label }),
    },
  }));
  return { nodes, edges };
}
