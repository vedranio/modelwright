import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  // The workspace packages ship TypeScript source, which Node won't run from node_modules: bundle them.
  noExternal: ['@modelwright/schema', '@modelwright/spec', '@modelwright/project'],
});
