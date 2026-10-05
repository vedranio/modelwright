import type { Cardinality } from '@modelwright/schema';

/**
 * Crow's-foot markers. Each end of a relationship carries two symbols on the line: the one
 * nearer the card is the maximum (a bar for one, a crow's foot for many), the one further out
 * is the minimum (a bar for "exactly", a circle for "zero or").
 *
 * | Cardinality | Meaning      | Glyph |
 * |-------------|--------------|-------|
 * | one         | exactly one  | ‖     |
 * | zero-one    | zero or one  | o|    |
 * | many        | one or more  | |<    |
 * | zero-many   | zero or more | o<    |
 */
export interface CardinalityMarker {
  /** The maximum, drawn against the card. */
  inner: 'bar' | 'crow';
  /** The minimum, drawn further along the line. */
  outer: 'bar' | 'circle';
}

const MARKERS: Record<Cardinality, CardinalityMarker> = {
  one: { inner: 'bar', outer: 'bar' },
  'zero-one': { inner: 'bar', outer: 'circle' },
  many: { inner: 'crow', outer: 'bar' },
  'zero-many': { inner: 'crow', outer: 'circle' },
};

export function cardinalityMarker(card: Cardinality): CardinalityMarker {
  return MARKERS[card];
}

/** Plain-words names and glyphs, for pickers and tooltips. */
export const CARDINALITY_LABELS: Record<Cardinality, { words: string; glyph: string }> = {
  one: { words: 'Exactly one', glyph: '‖' },
  'zero-one': { words: 'Zero or one', glyph: 'o|' },
  many: { words: 'One or more', glyph: '|<' },
  'zero-many': { words: 'Zero or more', glyph: 'o<' },
};

/**
 * Marker geometry in canvas units, in a local frame where the card's edge is at x = 0 and the
 * line runs out along +x. The edge component rotates the frame to the side the line leaves from.
 */
export const MARKER = {
  /** Half the height of a bar, and the crow's foot's half-spread at the card. */
  halfSpread: 7,
  /** Where the crow's foot's toes meet the line, measured from the card. */
  crowLength: 14,
  /** The inner bar's distance from the card (for `one` and `zero-one`). */
  innerBarAt: 8,
  /** The outer symbol's distance from the card. */
  outerAt: 20,
  circleRadius: 4.5,
  /** How far the markers reach: the straight stub the path must keep before turning. */
  extent: 32,
} as const;

export type MarkerShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; cx: number; cy: number; r: number };

/** The shapes for one end of a relationship, in the local marker frame. */
export function markerShapes(card: Cardinality): MarkerShape[] {
  const { inner, outer } = cardinalityMarker(card);
  const { halfSpread: h, crowLength, innerBarAt, outerAt, circleRadius } = MARKER;
  const bar = (x: number): MarkerShape => ({ kind: 'line', x1: x, y1: -h, x2: x, y2: h });
  const shapes: MarkerShape[] = [];

  if (inner === 'bar') {
    shapes.push(bar(innerBarAt));
  } else {
    // Three toes from the card meeting the line at crowLength.
    shapes.push(
      { kind: 'line', x1: 0, y1: -h, x2: crowLength, y2: 0 },
      { kind: 'line', x1: 0, y1: 0, x2: crowLength, y2: 0 },
      { kind: 'line', x1: 0, y1: h, x2: crowLength, y2: 0 },
    );
  }

  if (outer === 'bar') shapes.push(bar(inner === 'bar' ? innerBarAt + 6 : outerAt));
  else shapes.push({ kind: 'circle', cx: outerAt + circleRadius, cy: 0, r: circleRadius });

  return shapes;
}
