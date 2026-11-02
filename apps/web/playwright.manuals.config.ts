import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.MANUAL_BASE_URL ?? 'http://localhost:3000';

// Takes the pictures of the user manuals from the local stack with the demo data; not a test run.
export default defineConfig({
  testDir: './e2e/manuals',
  testMatch: '*.manual.ts',
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  },
});
