import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useStore,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import { EdgePopoverAnchor } from '../canvas/EdgePopoverAnchor';
import { orthogonalPath, type Rect } from '../canvas/edgeGeometry';
import type { TransitionFrom, TransitionTo } from '@modelwright/schema';
import { useReconnect } from './reconnect';
import { routeTransitionSides, type Fan } from './route';
import { TransitionPopover, type TargetScreen } from './TransitionPopover';

export type TransitionEdgeType = Edge<
  {
    label?: string;
    /** Its place among transitions from the same CTA, which fan out at separate columns. */
    fan: Fan;
    /** Which track a path going round the cards takes, counted per source screen. */
    track: number;
    /** e.g. "Login › Default › Sign in", for the popover. */
    fromText: string;
    from: TransitionFrom;
    to: TransitionTo;
    /** Every screen, for the popover's To list. */
    screens: readonly TargetScreen[];
    /** Whether this is the only thing selected, so its editing popover shows. */
    editing: boolean;
  },
  'transition'
>;

/** How wide a band round the line responds to the pointer, in canvas units. */
const INTERACTION_WIDTH = 24;

/** Arrowhead length and half-width, in canvas units. */
const ARROW_LENGTH = 8;
const ARROW_HALF_WIDTH = 4;

/** Half the reassign grip's on-screen size (`.transition-grip`), in pixels. */
const GRIP_RADIUS = 6;

/**
 * A transition: a directed arrow from a CTA's row to a screen or state header, in orthogonal
 * steps with rounded corners. It leaves and arrives on whichever sides of the two cards make
 * the shortest path (`routeTransitionSides`); the handles only fix the heights. The label
 * sits above the longest horizontal run, beside the line rather than on it.
 *
 * Selected, the arrow's tip has a grip: dragging it to another screen or state reassigns the
 * transition (FlowsView's reconnect). While it's dragged, a dashed line follows the pointer.
 */
export function TransitionEdge({
  id,
  source,
  target,
  sourceY,
  targetY,
  data,
  selected,
}: EdgeProps<TransitionEdgeType>) {
  const store = useStoreApi();
  const reconnect = useReconnect();
  // The grip keeps one on-screen size at any zoom, so it's always big enough to grab.
  const zoom = useStore((s) => s.transform[2]);
  const dragged = reconnect.reconnecting?.transitionId === id ? reconnect.reconnecting.at : null;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceRect = sourceNode && rectOf(sourceNode);
  const targetRect = targetNode && rectOf(targetNode);
  if (!sourceRect || !targetRect) return null;

  // The handles fix each end's height; the line starts and ends exactly on the cards' edges.
  const { points, label, from, to } = routeTransitionSides(
    sourceY,
    targetY,
    sourceRect,
    targetRect,
    data?.fan,
    data?.track ?? 0,
  );
  const tip = points[points.length - 1] ?? { x: targetRect.x, y: targetY };
  // Arriving on the left side the arrow points right, and on the right side, left. The line
  // stops at the arrowhead's base so its end doesn't poke through the tip.
  const inward = to === 'left' ? 1 : -1;
  const lineEnd = { x: tip.x - inward * ARROW_LENGTH, y: tip.y };
  const path = orthogonalPath([...points.slice(0, -1), lineEnd]);

  // Behind the arrowhead, clear of the card: cards are drawn above edges and would take the press.
  const grip = { x: lineEnd.x - (inward * GRIP_RADIUS) / zoom, y: tip.y };

  const start = points[0];
  if (dragged && start) {
    return (
      <path
        className="transition-line reconnecting"
        d={`M ${start.x} ${start.y} L ${dragged.x} ${dragged.y}`}
      />
    );
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className="transition-line"
        interactionWidth={INTERACTION_WIDTH}
      />
      <path
        className="transition-arrow"
        d={`M ${lineEnd.x} ${tip.y - ARROW_HALF_WIDTH} L ${tip.x} ${tip.y} L ${lineEnd.x} ${tip.y + ARROW_HALF_WIDTH} Z`}
      />
      {/* The CTA's dot is drawn on its card's right edge; leaving from the left, the line marks
          its own start the same way, above the card as labels are. */}
      {from === 'left' && points[0] && (
        <EdgeLabelRenderer>
          <div
            className="transition-origin"
            style={{
              transform: `translate(${points[0].x}px, ${points[0].y}px) translate(-50%, -50%)`,
            }}
          />
        </EdgeLabelRenderer>
      )}
      {data?.editing && (
        <EdgePopoverAnchor at={label}>
          <TransitionPopover
            transitionId={id}
            fromText={data.fromText}
            from={data.from}
            to={data.to}
            screens={data.screens}
            label={data.label ?? ''}
          />
        </EdgePopoverAnchor>
      )}
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="transition-grip nodrag nopan"
            title="Drag to another screen or state"
            onPointerDown={(e) => reconnect.start(id, e)}
            style={{
              transform: `translate(${grip.x}px, ${grip.y}px) translate(-50%, -50%) scale(${1 / zoom})`,
            }}
          />
        </EdgeLabelRenderer>
      )}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label transition-label nodrag nopan${selected ? ' selected' : ''}`}
            // The label selects its transition, as clicking the line does.
            onClick={() => store.getState().addSelectedEdges([id])}
            style={{
              transform: `translate(${label.x}px, ${label.y}px) translate(-50%, calc(-100% - var(--space-0)))`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function rectOf(node: InternalNode): Rect | null {
  const { width, height } = node.measured;
  if (!width || !height) return null;
  return { ...node.internals.positionAbsolute, width, height };
}
