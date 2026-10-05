import type { Entity } from '@modelwright/schema';
import type { Size } from '../canvas/placement';

/**
 * Entity card geometry in canvas units, used to place unpositioned entities without measuring
 * the DOM, so placement stays pure and deterministic. These are generous estimates of the card
 * that EntityNode renders (whose CSS sizes come from tokens.css); overestimating only adds space.
 */
export const ENTITY_WIDTH = 240;
const HEADER_HEIGHT = 40;
const DESCRIPTION_HEIGHT = 20;
const ATTRIBUTE_ROW_HEIGHT = 28;
const ATTRIBUTE_NOTE_HEIGHT = 16;
/** The list's padding, the "No attributes" line, and room for the "+ Add attribute" row. */
const FOOTER_HEIGHT = 48;

export function estimateEntitySize(entity: Entity): Size {
  return {
    width: ENTITY_WIDTH,
    height:
      HEADER_HEIGHT +
      (entity.description ? DESCRIPTION_HEIGHT : 0) +
      entity.attributes.reduce(
        (sum, a) => sum + ATTRIBUTE_ROW_HEIGHT + (a.note ? ATTRIBUTE_NOTE_HEIGHT : 0),
        0,
      ) +
      FOOTER_HEIGHT,
  };
}
