import { defineConfig } from '@playwright/test';

const APP_URL = process.env.POWER_APPS_URL
  || 'https://apps.powerapps.com/play/e/efcd2d46-3d9e-e31a-a9d8-5481ddae951c/app/a14aea12-c452-440c-8f45-ab854177c084?tenantId=899aca58-7bdc-45e9-bec6-1cc9d3f12894&hint=2c1ec90f-02f0-4879-a639-24c8154f08ea';

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
