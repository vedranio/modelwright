import {
  stringifyDesign,
  type Config,
  type DesignKind,
  type DesignSnapshot,
  type Erd,
  type Flows,
} from '@modelwright/schema';
import type { DesignDoc } from '../platform';

/**
 * The design as the last build recorded it, for "Revert to last build". Everything the build
 * diff compares comes back from the snapshot. Layout isn't a change (moving a card isn't), so
 * cards keep where they are now, and only cards that come back take their recorded spot.
 * Config keeps what the diff doesn't compare (devices, the dev command). A document that's
 * already as built comes back as the same object, so applying it changes nothing.
 */
export function revertToBuild(
  current: { erd: Erd; flows: Flows; config: Config },
  snapshot: DesignSnapshot,
): { erd: Erd; flows: Flows; config: Config } {
  return {
    erd: same('erd', current.erd, {
      ...snapshot.erd,
      layout: keepLayout(snapshot.erd, current.erd),
    }),
    flows: same('flows', current.flows, {
      ...snapshot.flows,
      layout: keepLayout(snapshot.flows, current.flows),
    }),
    config: same('config', current.config, {
      ...current.config,
      name: snapshot.config.name,
      preview: withUrl(current.config.preview, snapshot.config.preview.url),
    }),
  };
}

/** `next`, or `current` itself when the two would be written the same. */
function same<K extends DesignKind>(kind: K, current: DesignDoc<K>, next: DesignDoc<K>) {
  return stringifyDesign(kind, current) === stringifyDesign(kind, next) ? current : next;
}

type Layout = Erd['layout'];

/** The snapshot's cards, each where it is now if it's still on the canvas. */
function keepLayout(snapshot: { layout: Layout }, current: { layout: Layout }): Layout {
  return Object.fromEntries(
    Object.entries(snapshot.layout).map(([id, at]) => [id, current.layout[id] ?? at]),
  );
}

function withUrl(preview: Config['preview'], url: string | undefined): Config['preview'] {
  const next = { ...preview };
  delete next.url;
  return url === undefined ? next : { ...next, url };
}
