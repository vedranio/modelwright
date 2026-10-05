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
import type { Cardinality } from '@modelwright/schema';
import { floatingEnds, sideAngle, type EdgeEnd, type Rect, type Side } from './edgeGeometry';
import { EdgePopover } from './EdgePopover';
import { MARKER, markerShapes } from './markers';

export type CrowsFootEdgeType = Edge<
  {
    fromCard: Cardinality;
    toCard: Cardinality;
    label?: string;
    /** Shift along the cards' sides, to keep parallel relationships apart. */
    offset: number;
    fromName: string;
    toName: string;
    /** Whether this is the only thing selected, so its editing popover shows. */
    editing: boolean;
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
type LabelSide = 'above' | 'right';
const LABEL_PLACEMENT: Record<LabelSide, string> = {
  above: 'translate(-50%, calc(-100% - var(--space-1)))',
  right: 'translate(var(--space-2), -50%)',
};

/** Corner radius of the orthogonal path, in canvas units. */
const CORNER_RADIUS = 8;
/** How far a self-relationship's loop stands off the card's right side. */
const SELF_LOOP_REACH = 48;

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
  if (!sourceNode || !targetNode || !data) return null;
  const sourceRect = rectOf(sourceNode);
  const targetRect = rectOf(targetNode);
  if (!sourceRect || !targetRect) return null;

  const { path, labelX, labelY, labelSide, ends } =
    source === target ? selfLoop(sourceRect) : routed(sourceRect, targetRect, data.offset);

  return (
    <>
      <BaseEdge id={id} path={path} className="crowsfoot-line" interactionWidth={16} />
      <Marker end={ends.source} card={data.fromCard} />
      <Marker end={ends.target} card={data.toCard} />
      {data.editing && (
        <EdgeLabelRenderer>
          <div
            className="edge-popover-anchor"
            style={{ transform: `translate(-50%, 0) translate(${labelX}px, ${labelY}px)` }}
          >
            <EdgePopover
              relationshipId={id}
              fromName={data.fromName}
              toName={data.toName}
              fromCard={data.fromCard}
              toCard={data.toCard}
              label={data.label ?? ''}
            />
          </div>
        </EdgeLabelRenderer>
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

function routed(sourceRect: Rect, targetRect: Rect, offset: number) {
  const ends = floatingEnds(sourceRect, targetRect, offset);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: ends.source.x,
    sourceY: ends.source.y,
    sourcePosition: POSITION[ends.source.side],
    targetX: ends.target.x,
    targetY: ends.target.y,
    targetPosition: POSITION[ends.target.side],
    borderRadius: CORNER_RADIUS,
    // Keep a straight stub at each end long enough for the markers before the path turns.
    offset: MARKER.extent,
  });
  // The label anchors to the middle of the path. Ends on left/right sides make a horizontal
  // line, unless they're at different heights: then the path steps and its middle run is
  // vertical. The same holds the other way round for top/bottom ends.
  const leftRight = ends.source.side === 'left' || ends.source.side === 'right';
  const straight = leftRight ? ends.source.y === ends.target.y : ends.source.x === ends.target.x;
  const middleIsHorizontal = leftRight === straight;
  const labelSide: LabelSide = middleIsHorizontal ? 'above' : 'right';
  return { path, labelX, labelY, labelSide, ends };
}

/** A loop off the card's right side, for the rare relationship from an entity to itself. */
function selfLoop(r: Rect) {
  const x = r.x + r.width;
  const top = r.y + r.height * 0.3;
  const bottom = r.y + r.height * 0.7;
  const out = x + MARKER.extent + SELF_LOOP_REACH;
  const path = `M ${x} ${top} H ${out} V ${bottom} H ${x}`;
  const ends = {
    source: { x, y: top, side: 'right' as const },
    target: { x, y: bottom, side: 'right' as const },
  };
  const labelSide: LabelSide = 'right';
  return { path, labelX: out, labelY: (top + bottom) / 2, labelSide, ends };
}

function rectOf(node: InternalNode): Rect | null {
  const { width, height } = node.measured;
  if (!width || !height) return null;
  return { ...node.internals.positionAbsolute, width, height };
}
