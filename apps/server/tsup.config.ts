import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  // @modelwright/schema ships TypeScript source, which Node won't run from node_modules: bundle it.
  noExternal: ['@modelwright/schema'],
});
