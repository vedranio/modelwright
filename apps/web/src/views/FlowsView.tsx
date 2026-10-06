import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { NodeChange, OnConnectEnd, ReactFlowInstance, XYPosition } from '@xyflow/react';
import type { Flows } from '@modelwright/schema';
import { Canvas } from '../canvas/Canvas';
import { placeNodes } from '../canvas/placement';
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
  addTransition,
  deleteScreens,
  deleteTransitions,
  moveScreens,
} from '../flows/ops';
import { ScreenNode, type ScreenNodeType } from '../flows/ScreenNode';
import { TransitionEdge, type TransitionEdgeType } from '../flows/TransitionEdge';
import '../flows/flows.css';
import { useShortcut } from '../shortcuts';
import { Kbd } from '../ui';
import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard } from './common';

const NODE_TYPES = { screen: ScreenNode };
const EDGE_TYPES = { transition: TransitionEdge };

/** Where a new screen's top-left sits relative to the point it's created at. */
const NEW_SCREEN_OFFSET = { x: -SCREEN_WIDTH / 2, y: -20 };

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
  const [connecting, setConnecting] = useState(false);
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
   * Dropping a connection dragged from a CTA: on a state header it leads to that state,
   * anywhere else on a card to that screen's default state (see `dropTarget`). The new
   * transition is selected, which opens its popover.
   */
  const onConnectEnd: OnConnectEnd = (event, connection) => {
    setConnecting(false);
    const screenId = connection.fromNode?.id;
    const handleId = connection.fromHandle?.id;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!screenId || !handleId || !point) return;
    const from = ctaForHandle(flows, screenId, handleId);
    if (!from) return;
    const under = document.elementFromPoint(point.clientX, point.clientY);
    const to = dropTarget(flows, from, {
      screenId: under?.closest<HTMLElement>('.react-flow__node')?.dataset.id ?? null,
      stateId: under?.closest<HTMLElement>('[data-state-header]')?.dataset.stateHeader ?? null,
    });
    if (!to) return;
    let id: string | null = null;
    apply((doc) => {
      const result = addTransition(doc, from, to);
      id = result.id;
      return result.flows;
    });
    if (id) {
      selection.clear();
      selection.onEdgesChange([{ type: 'select', id, selected: true }]);
    }
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

  /** Adds a screen with its top-left near `at`, and opens its name for typing. */
  const createScreen = (at: XYPosition) => {
    let id: string | null = null;
    apply((doc) => {
      const result = addScreen(doc, {
        x: at.x + NEW_SCREEN_OFFSET.x,
        y: at.y + NEW_SCREEN_OFFSET.y,
      });
      id = result.id;
      return result.flows;
    });
    if (id) {
      selection.clear();
      setEditing({ kind: 'name', screenId: id, selectAll: true });
    }
  };

  const addAtCentre = () => {
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
    // Only on empty canvas: double-clicks on cards edit their text.
    if (!(e.target instanceof Element) || !e.target.classList.contains('react-flow__pane')) return;
    if (!instance.current) return;
    createScreen(instance.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  useShortcut(
    (e) => e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey,
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
          onConnectStart={() => setConnecting(true)}
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
            <button
              type="button"
              className="btn btn-quiet btn-tight toolbar-add"
              onClick={addAtCentre}
            >
              <span className="toolbar-add-plus" aria-hidden="true">
                +
              </span>
              Add screen
              <Kbd>S</Kbd>
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
            flows.screens.length === 0 && (
              <EmptyCard
                title="No screens yet"
                actions={
                  <button type="button" className="btn btn-primary" onClick={addAtCentre}>
                    Add screen
                    <Kbd>S</Kbd>
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
