import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/schema', 'apps/server'],
  },
});
