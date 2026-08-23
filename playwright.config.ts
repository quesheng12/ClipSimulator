import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-game',
      use: { ...devices['iPhone 13'], browserName: 'chromium', channel: 'chrome' },
      testMatch: /game\.spec\.ts/,
    },
    {
      name: 'desktop-editor',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        channel: 'chrome',
      },
      testMatch: /editor\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm --workspace @clip/game run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm --workspace @clip/editor run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
