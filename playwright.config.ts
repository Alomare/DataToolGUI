import { defineConfig } from '@playwright/test';

// End-to-end tests drive the real app (Tauri + WebView2) over the Chrome
// DevTools Protocol. See tests/e2e/README.md.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // One app instance: tests run one after another.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/e2e-report' }]],
  outputDir: 'test-results/e2e',
});
