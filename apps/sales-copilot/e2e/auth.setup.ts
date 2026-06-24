/**
 * Auth setup — opens Power Apps in headed mode, waits for manual Entra ID login,
 * then saves the browser storage state so subsequent tests reuse the session.
 *
 * Run once: `npx playwright test --project=auth-setup --headed`
 * After login, the session is saved to e2e/.auth/state.json (gitignored).
 */
import { test as setup } from '@playwright/test';

const APP_URL = process.env.POWER_APPS_URL;
if (!APP_URL) {
  throw new Error(
    'POWER_APPS_URL is not set. Export the play URL of your own Power Apps Code App, e.g.\n' +
      '  export POWER_APPS_URL="https://apps.powerapps.com/play/e/<env>/app/<appId>?tenantId=<tenant>"',
  );
}

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
