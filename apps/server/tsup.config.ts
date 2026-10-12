import { cp } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  // The workspace packages ship TypeScript source, which Node won't run from node_modules: bundle them.
  noExternal: [
    '@modelwright/core',
    '@modelwright/schema',
    '@modelwright/spec',
    '@modelwright/project',
  ],
  // The demo template travels beside the bundle, where the core's DEMO_TEMPLATE looks for it.
  onSuccess: () => cp('../../packages/core/demo', 'dist/demo', { recursive: true }),
});
