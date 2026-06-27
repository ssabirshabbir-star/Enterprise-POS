// vitest.config.ts — Vitest unit test configuration
//
// Scope: src/shared/**,  src/main/**  (unit tests only)
// Playwright handles e2e tests separately (playwright.config.ts)

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'tests/unit/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      'release',
      '_archive',
      'tests/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/shared/**', 'src/main/**'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', 'node_modules'],
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
});
