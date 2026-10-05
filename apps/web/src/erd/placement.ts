import type { Entity, Erd, Layout } from '@modelwright/schema';
import { placeNodes, type Size } from '../canvas/placement';

/** Positions for every entity, placing unpositioned ones with the shared `placeNodes`. */
export function placeEntities(erd: Erd, sizeOf: (entity: Entity) => Size): Layout {
  return placeNodes(erd.entities, erd.layout, sizeOf);
}
