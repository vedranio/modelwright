import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { NodeChange, ReactFlowInstance, XYPosition } from '@xyflow/react';
import type { Flows } from '@modelwright/schema';
import { Canvas } from '../canvas/Canvas';
import { fanOffsets } from '../canvas/edgeGeometry';
import { placeNodes } from '../canvas/placement';
import { useMeasurements } from '../canvas/useMeasurements';
import { useSelection } from '../canvas/useSelection';
import { SaveStatusPill } from '../editing/SaveStatusPill';
import type { EditableDoc } from '../editing/useEditableDoc';
import { connectedCtas, screensById, transitionEndpoints } from '../flows/endpoints';
import { SCREEN_WIDTH, estimateScreenSize } from '../flows/metrics';
import { addScreen, moveScreens } from '../flows/ops';
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

/** Space between transitions fanning out of one CTA, at their first turn. */
const FAN_SPACING = 12;

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
  const [dragging, setDragging] = useState<Record<string, XYPosition>>({});
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
  const edges = useMemo(
    () => flow.edges.map((e) => ({ ...e, selected: selection.selectedEdges.has(e.id) })),
    [flow, selection.selectedEdges],
  );

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

  /** Adds a screen with its top-left near `at`. */
  const createScreen = (at: XYPosition) => {
    apply(
      (doc) =>
        addScreen(doc, { x: at.x + NEW_SCREEN_OFFSET.x, y: at.y + NEW_SCREEN_OFFSET.y }).flows,
    );
    selection.clear();
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
    <div ref={container} className="canvas-host" onDoubleClick={onDoubleClick}>
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
        isValidConnection={() => false}
        onBeforeDelete={() => Promise.resolve(false)}
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
  const offsets = fanOffsets(
    flows.transitions,
    (t) => `${t.from.screenId}:${t.from.stateId}:${t.from.ctaId}`,
    FAN_SPACING,
  );
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
    if (!ends) return [];
    return [
      {
        id: t.id,
        type: 'transition',
        ...ends,
        data: {
          offset: offsets.get(t.id) ?? 0,
          track: tracks.get(t.id) ?? 0,
          ...(t.label !== undefined && { label: t.label }),
        },
      },
    ];
  });
  return { nodes, edges };
}
