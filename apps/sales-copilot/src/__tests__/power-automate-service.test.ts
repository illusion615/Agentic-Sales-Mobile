/**
 * Test suite: power-automate-service.ts
 * Tests LLM flow availability and invocation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFlowAvailable, invokeFlowForLLM } from '@/services/power-automate-service';

// Mock the LLM config
vi.mock('@/lib/i18n', () => ({
  getLLMConfig: () => ({ provider: 'power-automate', enabled: true }),
}));

// Mock the generated SDK service
vi.mock('@/generated/services/PowerAppsFlow_LLMService', () => ({
  PowerAppsFlow_LLMService: {
    Run: vi.fn(),
  },
}));

import { PowerAppsFlow_LLMService } from '@/generated/services/PowerAppsFlow_LLMService';

describe('power-automate-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isFlowAvailable', () => {
    it('returns true when LLM config is enabled', () => {
      expect(isFlowAvailable()).toBe(true);
    });
  });

  describe('invokeFlowForLLM', () => {
    it('serialises messages into a single prompt and calls SDK', async () => {
      const mockRun = PowerAppsFlow_LLMService.Run as ReturnType<typeof vi.fn>;
      mockRun.mockResolvedValue({
        success: true,
        data: { output: 'Hello from LLM' },
      });

      const result = await invokeFlowForLLM({
        messages: [
          { role: 'system', content: 'You are a helper' },
          { role: 'user', content: 'Hi' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello from LLM');
      expect(mockRun).toHaveBeenCalledOnce();
      // Check the serialised prompt contains both messages
      const callArg = mockRun.mock.calls[0][0];
      expect(callArg.text).toContain('system: You are a helper');
      expect(callArg.text).toContain('user: Hi');
    });

    it('returns error when SDK call fails', async () => {
      const mockRun = PowerAppsFlow_LLMService.Run as ReturnType<typeof vi.fn>;
      mockRun.mockResolvedValue({
        success: false,
        error: new Error('Flow timeout'),
      });

      const result = await invokeFlowForLLM({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Flow timeout');
    });

    it('returns error when SDK throws', async () => {
      const mockRun = PowerAppsFlow_LLMService.Run as ReturnType<typeof vi.fn>;
      mockRun.mockRejectedValue(new Error('Network error'));

      const result = await invokeFlowForLLM({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});
