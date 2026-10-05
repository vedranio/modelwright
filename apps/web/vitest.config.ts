import { defineProject } from 'vitest/config';

// Only pure modules are unit-tested here; components and hooks are verified in the browser.
export default defineProject({
  test: {
    name: '@modelwright/web',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
