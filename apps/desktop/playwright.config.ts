import { defineConfig } from '@playwright/test';

// Drives the built app (`out/`, or the packaged binary with MODELWRIGHT_APP set) through
// Playwright's Electron support. Run with `pnpm --filter @modelwright/desktop e2e`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
