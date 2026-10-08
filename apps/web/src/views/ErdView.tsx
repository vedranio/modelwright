import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { NodeChange, OnConnectEnd, ReactFlowInstance, XYPosition } from '@xyflow/react';
import type { Erd } from '@modelwright/schema';
import type { Rect } from '../canvas/edgeGeometry';
import { Canvas } from '../canvas/Canvas';
import { anchorCard, cardRects, nodeUnderPoint, revealCard } from '../canvas/cards';
import { besideAnchor, nudgeClear } from '../canvas/freeSpot';
import { UndoRedoButtons } from '../canvas/UndoRedoButtons';
import { useCanvasShortcuts } from '../canvas/useCanvasShortcuts';
import { useMeasurements } from '../canvas/useMeasurements';
import { useSelection } from '../canvas/useSelection';
import { SaveStatusPill } from '../editing/SaveStatusPill';
import { touchedErd } from '../editing/touched';
import { useCanvasHistory } from '../editing/useCanvasHistory';
import type { EditableDoc } from '../editing/useEditableDoc';
import { CrowsFootEdge, type CrowsFootEdgeType } from '../erd/CrowsFootEdge';
import { deletionSummary } from '../erd/deletion';
import { parallelSlots, selfLoopSide } from '../erd/edgeGeometry';
import { ErdEditorContext, type EditTarget, type ErdEditor } from '../erd/editor';
import { EntityNode, type EntityNodeType } from '../erd/EntityNode';
import { ENTITY_WIDTH, estimateEntitySize } from '../erd/metrics';
import {
  addEntity,
  addEntityWithRelationship,
  addRelationship,
  deleteEntities,
  deleteRelationships,
  duplicateEntities,
  moveEntities,
} from '../erd/ops';
import { placeEntities } from '../erd/placement';
import '../erd/erd.css';
import { useShortcut } from '../shortcuts';
import { shortcutHint } from '../shortcutRegistry';
import { Kbd } from '../ui';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

const NODE_TYPES = { entity: EntityNode };
const EDGE_TYPES = { crowsfoot: CrowsFootEdge };

/** Where a new entity's top-left sits relative to the point it's created at. */
const NEW_ENTITY_OFFSET = { x: -ENTITY_WIDTH / 2, y: -20 };

/** A new entity's size: no attributes yet. */
const NEW_ENTITY_SIZE = estimateEntitySize({ id: '', name: '', attributes: [] });

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
  /** The relationship under the pointer, highlighted with the entities it joins. */
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
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
  // A hovered or selected relationship lights up the two entities it joins.
  const highlighted = useMemo(() => {
    const lit = new Set<string>();
    for (const r of erd.relationships) {
      if (r.id !== hoveredEdge && !selection.selectedEdges.has(r.id)) continue;
      lit.add(r.from);
      lit.add(r.to);
    }
    return lit;
  }, [erd, hoveredEdge, selection.selectedEdges]);
  const nodes = useMemo(
    () =>
      flow.nodes.map((n) => {
        const measured = measurements.sizes.get(n.id);
        return {
          ...n,
          position: dragging[n.id] ?? n.position,
          selected: selection.selectedNodes.has(n.id),
          ...(measured && { measured }),
          ...(highlighted.has(n.id) && { data: { ...n.data, highlighted: true } }),
        };
      }),
    [flow, dragging, selection.selectedNodes, measurements.sizes, highlighted],
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
   * cardinalities; the new relationship is selected, which opens its popover. Dropping on empty
   * canvas creates an entity there, already related, with its name open for typing. Dropping
   * on the same entity does nothing.
   */
  const onConnectEnd: OnConnectEnd = (event, connection) => {
    const from = connection.fromNode?.id;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!from || !point) return;
    const under = nodeUnderPoint(point.clientX, point.clientY);
    if (!under) {
      if (!instance.current) return;
      const at = instance.current.screenToFlowPosition({ x: point.clientX, y: point.clientY });
      createEntity(at, (doc, position) => {
        const result = addEntityWithRelationship(doc, position, from);
        return { erd: result.erd, id: result.entityId };
      });
      return;
    }
    const to = under.node.dataset.id;
    if (!to || to === from) return;
    let id: string | null = null;
    apply((doc) => {
      const result = addRelationship(doc, from, to);
      id = result.id;
      return result.erd;
    });
    // After the click that ends the drag: dropped on its own card, that click would select
    // the card instead.
    if (id) setTimeout(() => selection.select([], [id as string]));
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

  /**
   * Adds an entity centred under `at` (nudged right until it overlaps no card), shows it if
   * it's off-screen, and opens its name for typing. `add` makes it, `addEntity` by default.
   */
  const createEntity = (
    at: XYPosition,
    add: (doc: Erd, position: XYPosition) => { erd: Erd; id: string | null } = addEntity,
  ) => {
    const spot = nudgeClear(
      cardRects(nodes),
      { x: at.x + NEW_ENTITY_OFFSET.x, y: at.y + NEW_ENTITY_OFFSET.y },
      NEW_ENTITY_SIZE,
    );
    placeEntity(spot, add);
  };

  /** Adds an entity with its top-left exactly at `spot`; see `createEntity`. */
  const placeEntity = (
    spot: XYPosition,
    add: (doc: Erd, position: XYPosition) => { erd: Erd; id: string | null } = addEntity,
  ) => {
    let id: string | null = null;
    apply((doc) => {
      const result = add(doc, spot);
      id = result.id;
      return result.erd;
    });
    if (!id) return;
    selection.clear();
    setEditing({ kind: 'name', entityId: id, selectAll: true });
    if (instance.current && container.current) {
      revealCard(instance.current, container.current, { ...spot, ...NEW_ENTITY_SIZE });
    }
  };

  /**
   * Add entity (button or E): beside the selected entity, or the last one added, never on top
   * of another. The first entity goes at the view's centre.
   */
  const addNext = () => {
    const anchor = anchorCard(nodes, selection.selectedNodes);
    if (anchor) {
      placeEntity(besideAnchor(cardRects(nodes), anchor, NEW_ENTITY_SIZE));
      return;
    }
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

  useCanvasShortcuts({
    selectAll: () =>
      selection.select(
        erd.entities.map((e) => e.id),
        erd.relationships.map((r) => r.id),
      ),
    deselect: selection.clear,
    duplicate: () => {
      const chosen = erd.entities.filter((e) => selection.selectedNodes.has(e.id)).map((e) => e.id);
      if (chosen.length === 0) return;
      let copies: string[] = [];
      let links: string[] = [];
      apply((doc) => {
        const result = duplicateEntities(doc, chosen);
        copies = result.ids;
        links = result.erd.relationships
          .filter((r) => copies.includes(r.from) && copies.includes(r.to))
          .map((r) => r.id);
        return result.erd;
      });
      selection.select(copies, links);
    },
    nudge: (dx, dy, coalesce) => {
      const chosen = erd.entities.filter((e) => selection.selectedNodes.has(e.id)).map((e) => e.id);
      if (chosen.length === 0) return;
      apply(
        (doc) =>
          moveEntities(
            doc,
            Object.fromEntries(
              chosen.flatMap((id) => {
                const at = doc.layout[id];
                return at ? [[id, { x: at.x + dx, y: at.y + dy }]] : [];
              }),
            ),
          ),
        { coalesce },
      );
    },
  });

  useShortcut('add-entity', (e) => {
    e.preventDefault();
    addNext();
  });

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
          onEdgeMouseEnter={(_event, edge) => setHoveredEdge(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdge(null)}
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
            <>
              <button
                type="button"
                className="btn btn-quiet btn-tight toolbar-add"
                onClick={addNext}
              >
                <span className="toolbar-add-plus" aria-hidden="true">
                  +
                </span>
                Add entity
                <Kbd>{shortcutHint('add-entity')}</Kbd>
              </button>
              <span className="divider" aria-hidden="true" />
              <UndoRedoButtons
                undo={history.undo}
                redo={history.redo}
                canUndo={edit.canUndo}
                canRedo={edit.canRedo}
              />
            </>
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
                  <button type="button" className="btn btn-primary" onClick={addNext}>
                    Add entity
                    <Kbd>{shortcutHint('add-entity')}</Kbd>
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
  const slots = parallelSlots(erd.relationships);
  // Self-relationships loop off the side of their card with the most room.
  const rects = new Map(
    erd.entities.map((e) => [
      e.id,
      { ...(positions[e.id] ?? { x: 0, y: 0 }), ...estimateEntitySize(e) },
    ]),
  );
  const loopSides = new Map(
    erd.relationships
      .filter((r) => r.from === r.to && rects.has(r.from))
      .map((r) => {
        const own = rects.get(r.from) as Rect;
        const others = [...rects].filter(([id]) => id !== r.from).map(([, rect]) => rect);
        return [r.from, selfLoopSide(own, others)];
      }),
  );
  const names = new Map(erd.entities.map((e) => [e.id, e.name]));
  const edges = erd.relationships.map((rel): CrowsFootEdgeType => ({
    id: rel.id,
    source: rel.from,
    target: rel.to,
    type: 'crowsfoot',
    data: {
      fromCard: rel.fromCard,
      toCard: rel.toCard,
      slot: slots.get(rel.id) ?? { index: 0, count: 1 },
      loopSide: loopSides.get(rel.from) ?? 'right',
      fromName: names.get(rel.from) ?? rel.from,
      toName: names.get(rel.to) ?? rel.to,
      editing: false,
      ...(rel.label !== undefined && { label: rel.label }),
    },
  }));
  return { nodes, edges };
}
