import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/schema', 'packages/spec', 'apps/server', 'apps/web'],
  },
});
