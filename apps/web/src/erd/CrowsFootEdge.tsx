import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import { useState } from 'react';
import type { Anchor, Cardinality, RelationshipAnchors } from '@modelwright/schema';
import {
  CORNER_RADIUS,
  orthogonalPath,
  sideAngle,
  type Rect,
  type Side,
} from '../canvas/edgeGeometry';
import { EndGrip } from '../canvas/EndGrip';
import { anchorPoint, nearestAnchor, setRelationshipAnchor } from './anchors';
import { useErdEditor } from './editor';
import {
  floatingEnds,
  parallelRoute,
  selfLoop,
  type EdgeEnd,
  type LabelPlacement,
  type ParallelSlot,
} from './edgeGeometry';
import { EdgePopover } from './EdgePopover';
import { MARKER, markerShapes } from './markers';
import { EdgePopoverAnchor } from '../canvas/EdgePopoverAnchor';

export type CrowsFootEdgeType = Edge<
  {
    fromCard: Cardinality;
    toCard: Cardinality;
    label?: string;
    /** Its place among relationships joining the same two entities, to keep them apart. */
    slot: ParallelSlot;
    /** For a relationship from an entity to itself, the side its loop leaves from. */
    loopSide: Side;
    fromName: string;
    toName: string;
    /** Whether this is the only thing selected, so its editing popover shows. */
    editing: boolean;
    /** Ends fixed where they join their cards; the rest float. */
    anchors?: RelationshipAnchors;
  },
  'crowsfoot'
>;

const POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/** Where a label sits relative to its anchor: centred above a horizontal run, right of a vertical one. */
type LabelSide = LabelPlacement;
/** Labels on parallel vertical runs are staggered this far apart, so they don't stack up. */
const LABEL_STAGGER = 20;
const LABEL_PLACEMENT: Record<LabelSide, string> = {
  above: 'translate(-50%, calc(-100% - var(--space-1)))',
  right: 'translate(var(--space-2), -50%)',
  below: 'translate(-50%, var(--space-1))',
};

/**
 * A relationship drawn in crow's-foot notation. It floats: the ends sit on whichever sides of
 * the two cards face each other, and re-route as the cards move. `fromCard` is drawn at the
 * source (`from`) end, `toCard` at the target (`to`) end.
 */
export function CrowsFootEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<CrowsFootEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { apply } = useErdEditor();
  /** An end being dragged to a new place, shown before it's dropped. */
  const [moving, setMoving] = useState<{ end: 'from' | 'to'; anchor: Anchor } | null>(null);
  if (!sourceNode || !targetNode || !data) return null;
  const sourceRect = rectOf(sourceNode);
  const targetRect = rectOf(targetNode);
  if (!sourceRect || !targetRect) return null;

  const loop = source === target;
  const anchors = moving ? { ...data.anchors, [moving.end]: moving.anchor } : data.anchors;
  const { path, labelX, labelY, labelSide, ends } = loop
    ? looped(sourceRect, data.slot, data.loopSide)
    : routed(sourceRect, targetRect, data.slot, anchors);

  /** A grip for each end of a selected relationship, sliding round its card's outline. */
  const grip = (end: 'from' | 'to') => {
    const rect = end === 'from' ? sourceRect : targetRect;
    const at = end === 'from' ? ends.source : ends.target;
    const name = end === 'from' ? data.fromName : data.toName;
    return (
      <EndGrip
        key={end}
        at={at}
        label={`Move where this joins ${name}`}
        onDrag={(p) => setMoving(p ? { end, anchor: nearestAnchor(rect, p) } : null)}
        onDrop={(p) => {
          setMoving(null);
          apply((erd) => setRelationshipAnchor(erd, id, end, nearestAnchor(rect, p)));
        }}
      />
    );
  };

  return (
    <>
      <BaseEdge id={id} path={path} className="crowsfoot-line" interactionWidth={16} />
      <Marker end={ends.source} card={data.fromCard} />
      <Marker end={ends.target} card={data.toCard} />
      {selected && !loop && [grip('from'), grip('to')]}
      {data.editing && (
        <EdgePopoverAnchor at={{ x: labelX, y: labelY }}>
          <EdgePopover
            relationshipId={id}
            fromName={data.fromName}
            toName={data.toName}
            fromCard={data.fromCard}
            toCard={data.toCard}
            label={data.label ?? ''}
            anchored={Boolean(data.anchors?.from ?? data.anchors?.to)}
          />
        </EdgePopoverAnchor>
      )}
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${selected ? ' selected' : ''}`}
            // Beside the line, never on it, so a label can't hide a marker on a short edge.
            style={{
              transform: `translate(${labelX}px, ${labelY}px) ${LABEL_PLACEMENT[labelSide]}`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function Marker({ end, card }: { end: EdgeEnd; card: Cardinality }) {
  return (
    <g
      className="crowsfoot-marker"
      transform={`translate(${end.x} ${end.y}) rotate(${sideAngle(end.side)})`}
    >
      {markerShapes(card).map((s, i) =>
        s.kind === 'line' ? (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        ) : (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
        ),
      )}
    </g>
  );
}

/** A point as a rectangle with no size, for floating the other end towards a fixed one. */
const pointRect = ({ x, y }: { x: number; y: number }): Rect => ({ x, y, width: 0, height: 0 });

/**
 * The ends of a relationship between two cards. With no anchors, they float as parallel
 * relationships do. A fixed end sits at its anchor, and a floating end faces the fixed one.
 */
function anchoredRoute(
  sourceRect: Rect,
  targetRect: Rect,
  slot: ParallelSlot,
  anchors: RelationshipAnchors | undefined,
): { ends: { source: EdgeEnd; target: EdgeEnd }; center: number | null } {
  const from = anchors?.from && anchorPoint(sourceRect, anchors.from);
  const to = anchors?.to && anchorPoint(targetRect, anchors.to);
  if (!from && !to) return parallelRoute(sourceRect, targetRect, slot);
  return {
    ends: {
      source: from ?? floatingEnds(sourceRect, pointRect(to as EdgeEnd)).source,
      target: to ?? floatingEnds(pointRect(from as EdgeEnd), targetRect).target,
    },
    center: null,
  };
}

function routed(
  sourceRect: Rect,
  targetRect: Rect,
  slot: ParallelSlot,
  anchors: RelationshipAnchors | undefined,
) {
  const { ends, center } = anchoredRoute(sourceRect, targetRect, slot, anchors);
  const leftRight = ends.source.side === 'left' || ends.source.side === 'right';
  const [path, pathLabelX, pathLabelY] = getSmoothStepPath({
    sourceX: ends.source.x,
    sourceY: ends.source.y,
    sourcePosition: POSITION[ends.source.side],
    targetX: ends.target.x,
    targetY: ends.target.y,
    targetPosition: POSITION[ends.target.side],
    borderRadius: CORNER_RADIUS,
    // Keep a straight stub at each end long enough for the markers before the path turns.
    offset: MARKER.extent,
    ...(center !== null && (leftRight ? { centerX: center } : { centerY: center })),
  });
  // The label anchors to the middle of the path. Ends on left/right sides make a horizontal
  // line, unless they're at different heights: then the path steps and its middle run is
  // vertical. The same holds the other way round for top/bottom ends.
  const straight = leftRight ? ends.source.y === ends.target.y : ends.source.x === ends.target.x;
  const middleIsHorizontal = leftRight === straight;
  const labelSide: LabelSide = middleIsHorizontal ? 'above' : 'right';
  // Parallel lines are apart vertically when the middle run is horizontal, so their labels
  // are too. Beside vertical runs, labels are staggered up and down to keep them apart.
  const stagger = middleIsHorizontal ? 0 : (slot.index - (slot.count - 1) / 2) * LABEL_STAGGER;
  const labelX = pathLabelX;
  const labelY = pathLabelY + stagger;
  return { path, labelX, labelY, labelSide, ends };
}

/** A loop off the card's right side, for a relationship from an entity to itself. */
function looped(r: Rect, slot: ParallelSlot, side: Side) {
  const loop = selfLoop(r, slot, side);
  return {
    path: orthogonalPath(loop.points),
    labelX: loop.label.x,
    labelY: loop.label.y,
    labelSide: loop.label.placement,
    ends: loop.ends,
  };
}

function rectOf(node: InternalNode): Rect | null {
  const { width, height } = node.measured;
  if (!width || !height) return null;
  return { ...node.internals.positionAbsolute, width, height };
}
