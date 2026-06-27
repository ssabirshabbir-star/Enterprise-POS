// vite.config.ts — Vite configuration for Enterprise POS
//
// Purpose: Provides a Vite-based build pipeline for future TypeScript/React renderer work.
//          Existing Electron main process continues to use require() / CommonJS unchanged.
//
// This config is NOT yet wired into the default `npm start` flow.
// It is invoked only by `npm run build:renderer` when explicitly needed.

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Build target: the Electron renderer process (chromium)
  root: resolve(__dirname, 'src/renderer'),
  base: './',

  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },

  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130', // Electron 42 uses Chromium 130+
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },

  // Dev server — used only for hot-reload development of renderer modules
  server: {
    port: 5173,
    strictPort: true,
  },
});
