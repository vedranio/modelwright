import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/schema',
      'packages/spec',
      'packages/project',
      'packages/core',
      'packages/client-contract',
      'packages/cli',
      'apps/server',
      'apps/desktop',
      'apps/web',
    ],
  },
});
