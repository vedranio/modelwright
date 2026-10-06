import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import { orthogonalPath, type Rect } from '../canvas/edgeGeometry';
import { routeTransitionSides, type Fan } from './route';
import { TransitionPopover } from './TransitionPopover';

export type TransitionEdgeType = Edge<
  {
    label?: string;
    /** Its place among transitions from the same CTA, which fan out at separate columns. */
    fan: Fan;
    /** Which track a path going round the cards takes, counted per source screen. */
    track: number;
    /** e.g. "Login › Default › Sign in", for the popover. */
    fromText: string;
    toScreenName: string;
    toStates: readonly { id: string; name: string }[];
    toStateId?: string;
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

/**
 * A transition: a directed arrow from a CTA's row to a screen or state header, in orthogonal
 * steps with rounded corners. It leaves and arrives on whichever sides of the two cards make
 * the shortest path (`routeTransitionSides`); the handles only fix the heights. The label
 * sits above the longest horizontal run, beside the line rather than on it.
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
        <EdgeLabelRenderer>
          <div
            className="edge-popover-anchor"
            style={{ transform: `translate(-50%, 0) translate(${label.x}px, ${label.y}px)` }}
          >
            <TransitionPopover
              transitionId={id}
              fromText={data.fromText}
              toScreenName={data.toScreenName}
              toStates={data.toStates}
              toStateId={data.toStateId}
              label={data.label ?? ''}
            />
          </div>
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
