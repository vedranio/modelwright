import type { z } from 'zod';
import type { DesignKind } from './common';
import { Config } from './config';
import { Erd } from './erd';
import { Flows } from './flows';

/** The validator for each design file. */
export const SCHEMAS = {
  erd: Erd,
  flows: Flows,
  config: Config,
} as const satisfies Record<DesignKind, z.ZodType>;

export interface DesignDocs {
  erd: Erd;
  flows: Flows;
  config: Config;
}

/** The typed document for a design file kind. */
export type DesignDoc<K extends DesignKind> = DesignDocs[K];
