/**
 * Auth setup — opens Power Apps in headed mode, waits for manual Entra ID login,
 * then saves the browser storage state so subsequent tests reuse the session.
 *
 * Run once: `npx playwright test --project=auth-setup --headed`
 * After login, the session is saved to e2e/.auth/state.json (gitignored).
 */
import { test as setup } from '@playwright/test';

const APP_URL = process.env.POWER_APPS_URL
  || 'https://apps.powerapps.com/play/e/efcd2d46-3d9e-e31a-a9d8-5481ddae951c/app/a14aea12-c452-440c-8f45-ab854177c084?tenantId=899aca58-7bdc-45e9-bec6-1cc9d3f12894&hint=2c1ec90f-02f0-4879-a639-24c8154f08ea';

setup('authenticate', async ({ page }) => {
  await page.goto(APP_URL);

  // Wait for the app to fully load after manual login
  // The user logs in manually in the headed browser
  console.log('\n🔑 Please log in to Power Apps in the browser window...');
  console.log('   The test will continue automatically once the app loads.\n');

  // Wait for the app container to appear (indicates successful auth + load)
  await page.waitForSelector('[data-testid="copilot-button"], button:has-text("Copilot")', {
    timeout: 120_000,
  });

  console.log('✅ App loaded. Saving auth state...');
  await page.context().storageState({ path: 'e2e/.auth/state.json' });
});
