import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import { orthogonalPath, type Rect } from '../canvas/edgeGeometry';
import { routeTransition } from './route';

export type TransitionEdgeType = Edge<
  {
    label?: string;
    /** Shift of the path's first turn, so transitions fanning out of one CTA stay apart. */
    offset: number;
    /** Which track a path going round the cards takes, counted per source screen. */
    track: number;
  },
  'transition'
>;

/** Arrowhead length and half-width, in canvas units. */
const ARROW_LENGTH = 8;
const ARROW_HALF_WIDTH = 4;

/**
 * A transition: a directed arrow from a CTA's row on the right of its card to a screen or state
 * header on the left of the target card, in orthogonal steps with rounded corners. The label
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
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceRect = sourceNode && rectOf(sourceNode);
  const targetRect = targetNode && rectOf(targetNode);
  if (!sourceRect || !targetRect) return null;

  // The handles sit across the cards' edges; the line starts and ends exactly on the edges.
  const start = { x: sourceRect.x + sourceRect.width, y: sourceY };
  const tip = { x: targetRect.x, y: targetY };
  const { points, label } = routeTransition(
    start,
    tip,
    sourceRect,
    targetRect,
    data?.offset ?? 0,
    data?.track ?? 0,
  );
  // The line stops at the arrowhead's base so its end doesn't poke through the tip.
  const lineEnd = { x: tip.x - ARROW_LENGTH, y: tip.y };
  const path = orthogonalPath([...points.slice(0, -1), lineEnd]);

  return (
    <>
      <BaseEdge id={id} path={path} className="transition-line" interactionWidth={12} />
      <path
        className="transition-arrow"
        d={`M ${lineEnd.x} ${tip.y - ARROW_HALF_WIDTH} L ${tip.x} ${tip.y} L ${lineEnd.x} ${tip.y + ARROW_HALF_WIDTH} Z`}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${selected ? ' selected' : ''}`}
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
