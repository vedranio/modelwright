import { defineProject } from 'vitest/config';

// The main process's pure parts. The app itself is tested with Playwright (e2e/).
export default defineProject({
  test: {
    name: '@modelwright/desktop',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
