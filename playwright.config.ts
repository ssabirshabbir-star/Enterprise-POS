import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90000,
  globalTimeout: 10 * 60 * 1000,
  reporter: [
    ['json', { outputFile: 'test-artifacts/electron-e2e/playwright-results.json' }],
    ['junit', { outputFile: 'test-artifacts/electron-e2e/playwright-results.xml' }],
    ['html', { outputFolder: 'test-artifacts/electron-e2e/playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      use: {},
    },
  ],
  outputDir: 'test-artifacts/electron-e2e/test-results',
});
