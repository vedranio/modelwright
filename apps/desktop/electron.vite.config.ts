import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

/** The renderer is apps/web's app itself, not a copy. */
const web = fileURLToPath(new URL('../web', import.meta.url));
const out = (dir: string) => fileURLToPath(new URL(`./out/${dir}`, import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: out('main'),
      // Bundle everything (the workspace packages ship TypeScript source), so the packaged app
      // needs no node_modules. Electron and Node's built-ins stay external.
      externalizeDeps: false,
      rollupOptions: { input: 'src/main/index.ts' },
    },
  },
  preload: {
    build: {
      outDir: out('preload'),
      externalizeDeps: false,
      // A sandboxed preload must be CommonJS.
      rollupOptions: {
        input: 'src/preload/index.ts',
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: web,
    plugins: [react()],
    // 4302 so the desktop renderer can run beside `pnpm dev` (4300 and 4301).
    server: { host: '127.0.0.1', port: 4302, strictPort: true },
    build: {
      outDir: out('renderer'),
      emptyOutDir: true,
      rollupOptions: { input: `${web}/index.html` },
    },
  },
});
