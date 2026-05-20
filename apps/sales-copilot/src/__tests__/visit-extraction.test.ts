/**
 * Test suite: visit-extraction.ts
 * Tests the Copilot Studio-based visit data extraction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Locale } from '@/lib/i18n';

// Mock executeFunction
const mockExecuteFunction = vi.fn();
vi.mock('@/lib/function-executor', () => ({
  executeFunction: (...args: unknown[]) => mockExecuteFunction(...args),
}));

// Mock isCopilotStudioAvailable
vi.mock('@/services/copilot-service', () => ({
  isCopilotStudioAvailable: () => true,
}));

import { extractVisitDataFromText, type FindAccountByNameFn } from '@/lib/visit-extraction';

const mockFindAccount: FindAccountByNameFn = (name: string) => {
  if (name === 'Acme Corp') return { id: 'acc-1', name1: 'Acme Corp' };
  return undefined;
};

describe('visit-extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls queryCopilotStudio with extraction prompt', async () => {
    mockExecuteFunction.mockResolvedValue({
      success: true,
      data: {
        answer: JSON.stringify({
          accountName: 'Acme Corp',
          contactName: 'John',
          visitType: 'in-person',
          summary: 'Discussed proposal',
          confidence: 90,
        }),
      },
    });

    const result = await extractVisitDataFromText(
      'Visited Acme Corp, met with John, discussed the proposal',
      mockFindAccount,
      'en-US' as Locale,
      'user-1'
    );

    expect(result).not.toBeNull();
    expect(result!.accountName).toBe('Acme Corp');
    expect(result!.accountId).toBe('acc-1');
    expect(result!.contactName).toBe('John');
    expect(result!.confidence).toBe(90);

    // Verify it went through queryCopilotStudio
    expect(mockExecuteFunction).toHaveBeenCalledWith(
      'queryCopilotStudio',
      expect.objectContaining({ query: expect.stringContaining('Visited Acme Corp') }),
      expect.objectContaining({ userId: 'user-1', locale: 'en-US' })
    );
  });

  it('returns null when executeFunction fails', async () => {
    mockExecuteFunction.mockResolvedValue({ success: false, error: 'timeout' });

    const result = await extractVisitDataFromText(
      'Some text',
      mockFindAccount,
      'en-US' as Locale,
      'user-1'
    );

    expect(result).toBeNull();
  });

  it('returns partial data when JSON parse fails', async () => {
    mockExecuteFunction.mockResolvedValue({
      success: true,
      data: { answer: 'This is not JSON at all' },
    });

    const result = await extractVisitDataFromText(
      'Some text',
      mockFindAccount,
      'en-US' as Locale,
      'user-1'
    );

    // Falls back to summary with confidence 50
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('This is not JSON at all');
    expect(result!.confidence).toBe(50);
  });

  it('uses Chinese prompt for zh-Hans locale', async () => {
    mockExecuteFunction.mockResolvedValue({
      success: true,
      data: { answer: JSON.stringify({ summary: '测试', confidence: 80 }) },
    });

    await extractVisitDataFromText('测试文本', mockFindAccount, 'zh-Hans', 'user-1');

    const call = mockExecuteFunction.mock.calls[0];
    expect(call[1].query).toContain('请从以下拜访描述中提取信息');
  });
});
