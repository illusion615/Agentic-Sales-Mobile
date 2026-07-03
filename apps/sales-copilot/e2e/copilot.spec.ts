/**
 * E2E Copilot tests — real LLM, real Dataverse, real UI.
 *
 * These tests open the actual Power Apps application, send messages through
 * the Copilot panel, and verify the responses contain expected content.
 * No mocks — every test exercises the full stack:
 *   User input → Copilot panel → copilot-agent → Frame LLM → Orchestrator LLM
 *   → function-executor → Dataverse queries → Pass 3 LLM → UI rendering
 *
 * Prerequisites:
 *   1. Run auth setup first: `npx playwright test --project=auth-setup --headed`
 *   2. Ensure test data exists in Dataverse (accounts, opportunities, activities)
 *
 * Run: `npx playwright test --project=e2e`
 */
import { test, expect, type Page } from '@playwright/test';

const RESPONSE_TIMEOUT = 60_000; // LLM calls can take up to 60s

/** Open the Copilot panel and wait for it to be ready */
async function openCopilot(page: Page) {
  // Wait for app to load
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  
  // Click the Copilot button (floating action button)
  const copilotBtn = page.locator('[data-testid="copilot-button"], button:has-text("Copilot")').first();
  if (await copilotBtn.isVisible()) {
    await copilotBtn.click();
    await page.waitForTimeout(500);
  }
}

/** Send a message in the Copilot panel and wait for the response */
async function sendMessage(page: Page, message: string): Promise<string> {
  // Find the input field
  const input = page.locator('textarea[placeholder], input[placeholder*="message"], input[placeholder*="消息"]').first();
  await input.fill(message);
  
  // Send via Enter
  await input.press('Enter');
  
  // Wait for the thinking indicator to appear and then disappear
  // (indicates the agent is processing and has finished)
  const thinkingIndicator = page.locator('[data-testid="thinking"], .animate-pulse, text=/思考|Thinking|生成|Generating/i').first();
  
  // Wait for response: look for the latest assistant message
  // The response appears as the last message with role=assistant
  await page.waitForFunction(
    (startTime) => {
      const messages = document.querySelectorAll('[data-role="assistant"], [data-type="agent"]');
      if (messages.length === 0) return false;
      const last = messages[messages.length - 1];
      const text = last.textContent || '';
      // Response should have meaningful content (not just thinking dots)
      return text.length > 10 && !text.includes('...');
    },
    Date.now(),
    { timeout: RESPONSE_TIMEOUT }
  ).catch(() => null);

  // Get the last agent message content
  const lastMessage = page.locator('[data-role="assistant"], [data-type="agent"]').last();
  return (await lastMessage.textContent()) || '';
}

/** Get the number of record list cards visible */
async function getRecordCardCount(page: Page): Promise<number> {
  const cards = page.locator('[data-testid="record-card"], .record-list-card .glass-card');
  return cards.count();
}

// ======================== Test Scenarios ========================

test.describe('Copilot E2E — Real LLM + Real Dataverse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await openCopilot(page);
  });

  test('query opportunities — returns list with record cards', async ({ page }) => {
    const response = await sendMessage(page, 'show me my opportunities');
    
    // Response should mention opportunities or pipeline
    expect(response.toLowerCase()).toMatch(/opportunit|pipeline|商机|deal/);
    
    // Should have record cards displayed
    const cardCount = await getRecordCardCount(page);
    expect(cardCount).toBeGreaterThan(0);
  });

  test('query accounts — returns account list', async ({ page }) => {
    const response = await sendMessage(page, 'show me my accounts');
    
    expect(response.toLowerCase()).toMatch(/account|客户|client/);
  });

  test('greeting — responds naturally without data query', async ({ page }) => {
    const response = await sendMessage(page, 'hello');
    
    // Should get a friendly response, not an error
    expect(response.length).toBeGreaterThan(5);
    expect(response.toLowerCase()).not.toContain('error');
    expect(response.toLowerCase()).not.toContain('failed');
  });

  test('follow-up analysis — context-aware response', async ({ page }) => {
    // First query
    await sendMessage(page, 'show me my opportunities');
    await page.waitForTimeout(2000);
    
    // Follow-up question about the same data
    const followUp = await sendMessage(page, 'which one has the highest amount?');
    
    // Should reference specific opportunity data, not ask to re-query
    expect(followUp.length).toBeGreaterThan(20);
  });

  test('activity query with date filter', async ({ page }) => {
    const response = await sendMessage(page, "show me today's activities");
    
    expect(response.toLowerCase()).toMatch(/activit|活动|visit|call|meeting/);
  });

  test('error resilience — handles unknown intent gracefully', async ({ page }) => {
    const response = await sendMessage(page, 'xyzzy foobar nonsense 12345');
    
    // Should NOT crash — should either ask for clarification or give a fallback response
    expect(response.length).toBeGreaterThan(5);
    expect(response.toLowerCase()).not.toContain('undefined');
    expect(response.toLowerCase()).not.toContain('null');
  });

  test('multi-turn conversation maintains context', async ({ page }) => {
    // Ask about accounts
    await sendMessage(page, 'how many accounts do I have?');
    await page.waitForTimeout(2000);
    
    // Follow up with a different entity type — should NOT reuse old context
    const response = await sendMessage(page, 'now show me my contacts');
    
    expect(response.toLowerCase()).toMatch(/contact|联系人/);
  });
});
