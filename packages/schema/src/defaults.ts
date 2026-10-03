import type { Config } from './config';
import type { Erd } from './erd';
import type { Flows } from './flows';

/** These are what initialising `.design/` writes. */

export function defaultErd(): Erd {
  return { schemaVersion: 1, entities: [], relationships: [], layout: {} };
}

export function defaultFlows(): Flows {
  return { schemaVersion: 1, screens: [], transitions: [], layout: {} };
}

export function defaultConfig(name: string): Config {
  return { schemaVersion: 1, name, preview: {} };
}
