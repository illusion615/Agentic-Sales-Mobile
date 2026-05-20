/**
 * Test suite: MicrosoftCopilotStudioService
 * Tests the SDK connector service (CLI-generated).
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the Power Apps SDK data module
vi.mock('@microsoft/power-apps/data', () => {
  const mockExecuteAsync = vi.fn();
  return {
    getClient: () => ({ executeAsync: mockExecuteAsync }),
    __mockExecuteAsync: mockExecuteAsync,
  };
});

import { MicrosoftCopilotStudioService } from '@/generated/services/MicrosoftCopilotStudioService';

async function getMockExecuteAsync() {
  const mod = await import('@microsoft/power-apps/data') as unknown as { __mockExecuteAsync: ReturnType<typeof vi.fn> };
  return mod.__mockExecuteAsync;
}

describe('MicrosoftCopilotStudioService', () => {
  it('calls ExecuteCopilotAsyncV2 with correct parameters', async () => {
    const mockExec = await getMockExecuteAsync();
    mockExec.mockResolvedValue({
      success: true,
      data: {
        lastResponse: 'Bot says hello',
        responses: ['Bot says hello'],
        conversationId: 'conv-abc',
      },
    });

    const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
      'crf5c_agentrl2oCW',
      { message: 'Hello' },
    );

    expect(result.success).toBe(true);

    // Verify the connector operation shape
    expect(mockExec).toHaveBeenCalledWith({
      connectorOperation: {
        tableName: 'microsoftcopilotstudio',
        operationName: 'ExecuteCopilotAsyncV2',
        parameters: {
          Copilot: 'crf5c_agentrl2oCW',
          body: { message: 'Hello' },
          'x-ms-conversation-id': undefined,
          environmentId: undefined,
        },
      },
    });
  });

  it('propagates SDK errors', async () => {
    const mockExec = await getMockExecuteAsync();
    mockExec.mockResolvedValue({
      success: false,
      error: new Error('Agent not found'),
    });

    const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
      'nonexistent',
      { message: 'test' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Agent not found');
  });
});
