import { defineConfig } from '@playwright/test';

const APP_URL = process.env.POWER_APPS_URL;
if (!APP_URL) {
  throw new Error(
    'POWER_APPS_URL is not set. Export the play URL of your own Power Apps Code App, e.g.\n' +
      '  export POWER_APPS_URL="https://apps.powerapps.com/play/e/<env>/app/<appId>?tenantId=<tenant>"',
  );
}

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,        // 2 min per test (LLM calls are slow)
  retries: 1,
  use: {
    baseURL: APP_URL,
    headless: false,       // Power Apps needs auth; run headed for first setup
    viewport: { width: 430, height: 932 }, // mobile viewport
    storageState: './e2e/.auth/state.json', // reuse auth session
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'e2e',
      dependencies: ['auth-setup'],
    },
  ],
});
