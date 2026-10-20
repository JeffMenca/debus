import { defineConfig, devices } from '@playwright/test';
import { MOCKED_API_URL } from './e2e/support/mocked-api';

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${port}`,
        url: `${baseURL}/api/health`,
        // next start keeps a variable the process already has over apps/web/.env.
        env: process.env.E2E_REAL_API ? {} : { API_URL: MOCKED_API_URL },
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
