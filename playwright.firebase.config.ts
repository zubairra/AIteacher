import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.FIREBASE_E2E_BASE_URL || 'http://127.0.0.1:3010';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: /firebase-teacher-cloud.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL,
    channel: 'chrome',
    headless: process.env.FIREBASE_E2E_HEADED === '1' ? false : true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--disable-popup-blocking'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
