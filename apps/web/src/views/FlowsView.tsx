import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { NodeChange, OnConnectEnd, ReactFlowInstance, XYPosition } from '@xyflow/react';
import type { Flows, TransitionFrom } from '@modelwright/schema';
import { Canvas } from '../canvas/Canvas';
import { anchorCard, cardRects, nodeUnderPoint, revealCard } from '../canvas/cards';
import { besideAnchor, nudgeClear } from '../canvas/freeSpot';
import { placeNodes } from '../canvas/placement';
import { UndoRedoButtons } from '../canvas/UndoRedoButtons';
import { useCanvasShortcuts } from '../canvas/useCanvasShortcuts';
import { useMeasurements } from '../canvas/useMeasurements';
import { useSelection } from '../canvas/useSelection';
import { SaveStatusPill } from '../editing/SaveStatusPill';
import { touchedFlows } from '../editing/touched';
import { useCanvasHistory } from '../editing/useCanvasHistory';
import type { EditableDoc } from '../editing/useEditableDoc';
import { deletionSummary } from '../flows/deletion';
import { connectedCtas, fanPlaces, screensById, transitionEndpoints } from '../flows/endpoints';
import { SCREEN_WIDTH, estimateScreenSize } from '../flows/metrics';
import { ctaForHandle, dropTarget } from '../flows/connect';
import { FlowsEditorContext, type EditTarget, type FlowsEditor } from '../flows/editor';
import {
  addScreen,
  addScreenWithTransition,
  addTransition,
  deleteScreens,
  deleteTransitions,
  duplicateScreens,
  moveScreens,
} from '../flows/ops';
import { ScreenNode, type Highlight, type ScreenNodeType } from '../flows/ScreenNode';
import { TransitionEdge, type TransitionEdgeType } from '../flows/TransitionEdge';
import '../flows/flows.css';
import { useShortcut } from '../shortcuts';
import { shortcutHint } from '../shortcutRegistry';
import { Kbd } from '../ui';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

const NODE_TYPES = { screen: ScreenNode };
const EDGE_TYPES = { transition: TransitionEdge };

/** Where a new screen's top-left sits relative to the point it's created at. */
const NEW_SCREEN_OFFSET = { x: -SCREEN_WIDTH / 2, y: -20 };

/** A new screen's size: one empty default state. */
const NEW_SCREEN_SIZE = estimateScreenSize({
  id: '',
  name: '',
  states: [{ id: '', name: '', sees: [], ctas: [] }],
});

type Apply = EditableDoc<'flows'>['apply'];

interface Props {
  projectPath: string;
  state: DocState<'flows'>;
  edit: EditableDoc<'flows'>;
  onReload: () => void;
}

export function FlowsView({ projectPath, state, edit, onReload }: Props) {
  return (
    <div className="view-fill">
      <DocStateView kind="flows" state={state} onReload={onReload}>
        {(onDisk) => (
          <FlowsCanvas projectPath={projectPath} flows={edit.doc ?? onDisk} edit={edit} />
        )}
      </DocStateView>
    </div>
  );
}

function FlowsCanvas({
  projectPath,
  flows,
  edit,
}: {
  projectPath: string;
  flows: Flows;
  edit: EditableDoc<'flows'>;
}) {
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [dragging, setDragging] = useState<Record<string, XYPosition>>({});
  /** The CTA a connection is being dragged from, while one is. */
  const [connecting, setConnecting] = useState<TransitionFrom | null>(null);
  /** The transition under the pointer, highlighted with its two ends. */
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const selection = useSelection();
  const measurements = useMeasurements();
  const instance = useRef<ReactFlowInstance<ScreenNodeType, TransitionEdgeType> | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const { apply: applyDoc } = edit;
  /**
   * Applies a Flows operation. Screens shown at computed positions get those positions written
   * with the first real edit, so nothing moves when the file is next read.
   */
  const apply = useCallback<Apply>(
    (op, options) =>
      applyDoc((doc) => {
        const placed = withPlacement(doc);
        const next = op(placed);
        return next === placed ? doc : next;
      }, options),
    [applyDoc],
  );

  const history = useCanvasHistory('flows', edit, touchedFlows, selection.select);
  const { remove: removeDoc } = history;
  const remove = useCallback<FlowsEditor['remove']>(
    (op, describe) => removeDoc(op, describe, apply),
    [removeDoc, apply],
  );

  const editor = useMemo<FlowsEditor>(
    () => ({ apply, remove, editing, setEditing }),
    [apply, remove, editing],
  );

  const flow = useMemo(() => toFlow(flows), [flows]);
  // The hovered and selected transitions light up their source CTA and target state.
  const highlights = useMemo(() => {
    const lit = new Set(selection.selectedEdges);
    if (hoveredEdge) lit.add(hoveredEdge);
    return transitionHighlights(flows, lit);
  }, [flows, hoveredEdge, selection.selectedEdges]);
  const nodes = useMemo(
    () =>
      flow.nodes.map((n) => {
        const measured = measurements.sizes.get(n.id);
        const highlight = highlights.get(n.id);
        return {
          ...n,
          position: dragging[n.id] ?? n.position,
          selected: selection.selectedNodes.has(n.id),
          ...(measured && { measured }),
          data: {
            ...n.data,
            ...(highlight && { highlight }),
            // A connection can't be dropped on its own state.
            ...(connecting?.screenId === n.id && { noDropState: connecting.stateId }),
          },
        };
      }),
    [flow, dragging, selection.selectedNodes, measurements.sizes, highlights, connecting],
  );
  const edges = useMemo(() => {
    // The popover shows when one transition, and nothing else, is selected. Only count what
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
   * Dropping a connection dragged from a CTA: in a state (header or body) it leads to that
   * state, anywhere else on a card to that screen's default state (see `dropTarget`). On empty
   * canvas it creates a screen there, already connected, with its name open for typing. The
   * new transition is selected, which opens its popover.
   */
  const onConnectEnd: OnConnectEnd = (event, connection) => {
    setConnecting(null);
    const screenId = connection.fromNode?.id;
    const handleId = connection.fromHandle?.id;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!screenId || !handleId || !point) return;
    const from = ctaForHandle(flows, screenId, handleId);
    if (!from) return;
    const under = nodeUnderPoint(point.clientX, point.clientY);
    if (!under) {
      if (!instance.current) return;
      const at = instance.current.screenToFlowPosition({ x: point.clientX, y: point.clientY });
      createScreen(at, (doc, position) => {
        const result = addScreenWithTransition(doc, position, from);
        return { flows: result.flows, id: result.screenId };
      });
      return;
    }
    const to = dropTarget(flows, from, {
      screenId: under.node.dataset.id ?? null,
      stateId: under.element.closest<HTMLElement>('[data-state]')?.dataset.state ?? null,
    });
    if (!to) return;
    let id: string | null = null;
    apply((doc) => {
      const result = addTransition(doc, from, to);
      id = result.id;
      return result.flows;
    });
    // After the click that ends the drag: dropped on its own card, that click would select
    // the card instead.
    if (id) setTimeout(() => selection.select([], [id as string]));
  };

  const onNodesChange = (changes: NodeChange<ScreenNodeType>[]) => {
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
   * Adds a screen centred under `at` (nudged right until it overlaps no card), shows it if
   * it's off-screen, and opens its name for typing. `add` makes it, `addScreen` by default.
   */
  const createScreen = (
    at: XYPosition,
    add: (doc: Flows, position: XYPosition) => { flows: Flows; id: string | null } = addScreen,
  ) => {
    const spot = nudgeClear(
      cardRects(nodes),
      { x: at.x + NEW_SCREEN_OFFSET.x, y: at.y + NEW_SCREEN_OFFSET.y },
      NEW_SCREEN_SIZE,
    );
    placeScreen(spot, add);
  };

  /** Adds a screen with its top-left exactly at `spot`; see `createScreen`. */
  const placeScreen = (
    spot: XYPosition,
    add: (doc: Flows, position: XYPosition) => { flows: Flows; id: string | null } = addScreen,
  ) => {
    let id: string | null = null;
    apply((doc) => {
      const result = add(doc, spot);
      id = result.id;
      return result.flows;
    });
    if (!id) return;
    selection.clear();
    setEditing({ kind: 'name', screenId: id, selectAll: true });
    if (instance.current && container.current) {
      revealCard(instance.current, container.current, { ...spot, ...NEW_SCREEN_SIZE });
    }
  };

  /**
   * Add screen (button or S): beside the selected screen, or the last one added, never on top
   * of another. The first screen goes at the view's centre.
   */
  const addNext = () => {
    const anchor = anchorCard(nodes, selection.selectedNodes);
    if (anchor) {
      placeScreen(besideAnchor(cardRects(nodes), anchor, NEW_SCREEN_SIZE));
      return;
    }
    const rect = container.current?.getBoundingClientRect();
    if (!rect || !instance.current) return;
    createScreen(
      instance.current.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }),
    );
  };

  const onDoubleClick = (e: MouseEvent) => {
    // Only on empty canvas: clicks on cards edit their text.
    if (!(e.target instanceof Element) || !e.target.classList.contains('react-flow__pane')) return;
    if (!instance.current) return;
    createScreen(instance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  useCanvasShortcuts({
    selectAll: () =>
      selection.select(
        flows.screens.map((sc) => sc.id),
        flows.transitions.map((t) => t.id),
      ),
    deselect: selection.clear,
    duplicate: () => {
      const chosen = flows.screens
        .filter((sc) => selection.selectedNodes.has(sc.id))
        .map((sc) => sc.id);
      if (chosen.length === 0) return;
      let copies: string[] = [];
      let links: string[] = [];
      apply((doc) => {
        const result = duplicateScreens(doc, chosen);
        copies = result.ids;
        links = result.flows.transitions
          .filter((t) => copies.includes(t.from.screenId))
          .map((t) => t.id);
        return result.flows;
      });
      selection.select(copies, links);
    },
    nudge: (dx, dy, coalesce) => {
      const chosen = flows.screens
        .filter((sc) => selection.selectedNodes.has(sc.id))
        .map((sc) => sc.id);
      if (chosen.length === 0) return;
      apply(
        (doc) =>
          moveScreens(
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

  useShortcut('add-screen', (e) => {
    e.preventDefault();
    addNext();
  });

  return (
    <FlowsEditorContext.Provider value={editor}>
      <div
        ref={container}
        className={`canvas-host${connecting ? ' connecting' : ''}`}
        onDoubleClick={onDoubleClick}
      >
        <Canvas<ScreenNodeType, TransitionEdgeType>
          viewportKey={`flows:${projectPath}`}
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
              (doc) => moveScreens(doc, Object.fromEntries(dragged.map((n) => [n.id, n.position]))),
              { saveNow: true },
            );
            setDragging({});
          }}
          onConnectStart={(_event, { nodeId, handleId }) =>
            setConnecting(nodeId && handleId ? ctaForHandle(flows, nodeId, handleId) : null)
          }
          onEdgeMouseEnter={(_event, edge) => setHoveredEdge(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdge(null)}
          onConnectEnd={onConnectEnd}
          // Only dropping onto a card counts (onConnectEnd); never connect handle to handle.
          isValidConnection={() => false}
          onBeforeDelete={({ nodes: goneNodes, edges: goneEdges }) => {
            // Flows deletes never ask (decisions.md); the toast offers Undo.
            const screenIds = new Set(goneNodes.map((n) => n.id));
            const transitionIds = new Set(goneEdges.map((e) => e.id));
            remove(
              (doc) => deleteTransitions(deleteScreens(doc, screenIds), transitionIds),
              (doc) => deletionSummary(doc, screenIds, transitionIds),
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
                Add screen
                <Kbd>{shortcutHint('add-screen')}</Kbd>
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
            flows.screens.length === 0 && (
              <EmptyCard
                title="No screens yet"
                actions={
                  <button type="button" className="btn btn-primary" onClick={addNext}>
                    Add screen
                    <Kbd>{shortcutHint('add-screen')}</Kbd>
                  </button>
                }
              >
                Screens are the places a user can be. Add one, then connect it to others.
              </EmptyCard>
            )
          }
        />
      </div>
    </FlowsEditorContext.Provider>
  );
}

/** The document with every screen positioned: computed spots filled in for any without one. */
function withPlacement(flows: Flows): Flows {
  if (flows.screens.every((s) => flows.layout[s.id])) return flows;
  const placed = placeNodes(flows.screens, flows.layout, estimateScreenSize);
  const missing = Object.fromEntries(
    flows.screens
      .filter((s) => !flows.layout[s.id])
      .map((s) => [s.id, placed[s.id] ?? { x: 0, y: 0 }]),
  );
  return moveScreens(flows, missing);
}

/** The document as React Flow nodes and edges. Unpositioned screens are placed in memory only. */
function toFlow(flows: Flows): { nodes: ScreenNodeType[]; edges: TransitionEdgeType[] } {
  const positions = placeNodes(flows.screens, flows.layout, estimateScreenSize);
  const connected = connectedCtas(flows);
  const nodes = flows.screens.map((screen): ScreenNodeType => {
    // An initial size lets React Flow show a new card at once instead of hiding it until measured.
    const size = estimateScreenSize(screen);
    const own = new Set(
      screen.states.flatMap((st) =>
        st.ctas.map((c) => `${st.id}:${c.id}`).filter((key) => connected.has(key)),
      ),
    );
    return {
      id: screen.id,
      type: 'screen',
      position: positions[screen.id] ?? { x: 0, y: 0 },
      data: { screen, connected: own },
      initialWidth: size.width,
      initialHeight: size.height,
    };
  });
  const screens = screensById(flows);
  const fans = fanPlaces(flows);
  // Each screen's outgoing transitions get their own track, so loops round it stay apart.
  const tracks = new Map<string, number>();
  const nextTrack = new Map<string, number>();
  for (const t of flows.transitions) {
    const n = nextTrack.get(t.from.screenId) ?? 0;
    tracks.set(t.id, n);
    nextTrack.set(t.from.screenId, n + 1);
  }
  const edges = flows.transitions.flatMap((t): TransitionEdgeType[] => {
    const ends = transitionEndpoints(screens, t);
    const fromScreen = screens.get(t.from.screenId);
    const toScreen = screens.get(t.to.screenId);
    if (!ends || !fromScreen || !toScreen) return [];
    const fromState = fromScreen.states.find((st) => st.id === t.from.stateId);
    const cta = fromState?.ctas.find((c) => c.id === t.from.ctaId);
    return [
      {
        id: t.id,
        type: 'transition',
        ...ends,
        data: {
          fan: fans.get(t.id) ?? { index: 0, count: 1 },
          track: tracks.get(t.id) ?? 0,
          fromText: [fromScreen.name, fromState?.name, cta?.label].join(' › '),
          toScreenName: toScreen.name,
          toStates: toScreen.states.map((st) => ({ id: st.id, name: st.name })),
          ...(t.to.stateId !== undefined && { toStateId: t.to.stateId }),
          editing: false,
          ...(t.label !== undefined && { label: t.label }),
        },
      },
    ];
  });
  return { nodes, edges };
}

/**
 * Per screen, the CTAs and states that the given transitions start from and lead to. A
 * transition with no `stateId` leads to the target screen's default (first) state.
 */
function transitionHighlights(flows: Flows, ids: ReadonlySet<string>): Map<string, Highlight> {
  const out = new Map<string, { ctas: Set<string>; states: Set<string> }>();
  const of = (screenId: string) => {
    let h = out.get(screenId);
    if (!h) out.set(screenId, (h = { ctas: new Set(), states: new Set() }));
    return h;
  };
  for (const t of flows.transitions) {
    if (!ids.has(t.id)) continue;
    of(t.from.screenId).ctas.add(`${t.from.stateId}:${t.from.ctaId}`);
    const target =
      t.to.stateId ?? flows.screens.find((sc) => sc.id === t.to.screenId)?.states[0]?.id;
    if (target) of(t.to.screenId).states.add(target);
  }
  return out;
}
