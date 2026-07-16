import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEnrichmentToAccount, extractEnrichmentJson } from '@/services/account-enrichment-service';

const serviceMocks = vi.hoisted(() => ({
  accountUpdate: vi.fn(),
  summariesGetAll: vi.fn(),
  summaryCreate: vi.fn(),
  summaryUpdate: vi.fn(),
}));

vi.mock('@/generated/services/account-service', () => ({
  AccountService: { update: serviceMocks.accountUpdate },
}));

vi.mock('@/generated/services/ai-summary-service', () => ({
  AISummaryService: {
    getAll: serviceMocks.summariesGetAll,
    create: serviceMocks.summaryCreate,
    update: serviceMocks.summaryUpdate,
  },
}));

describe('extractEnrichmentJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.accountUpdate.mockResolvedValue({ id: 'account-1', name1: 'Contoso', ownerid: 'owner-1' });
    serviceMocks.summariesGetAll.mockResolvedValue([]);
  });

  it('repairs unescaped quotation marks in a successful production-style reply', () => {
    const reply = '{"status":"ok","reason":"","fields":{"description":"一家高新技术企业暨"专精特新小巨人"企业。"},"marketingInsight":"**行业趋势：**\\n\\n- [来源](https://example.com)"}';

    expect(extractEnrichmentJson(reply)).toEqual({
      status: 'ok',
      reason: '',
      fields: {
        description: '一家高新技术企业暨"专精特新小巨人"企业。',
      },
      marketingInsight: '**行业趋势：**\n\n- [来源](https://example.com)',
    });
  });

  it('repairs quoted entity names in a skipped reply', () => {
    const reply = '{"status":"skipped","reason":"无法确认"渥泰新能源"与"沃太能源"是同一主体。","fields":{},"marketingInsight":""}';

    expect(extractEnrichmentJson(reply)).toEqual({
      status: 'skipped',
      reason: '无法确认"渥泰新能源"与"沃太能源"是同一主体。',
      fields: {},
      marketingInsight: '',
    });
  });

  it('accepts a fenced contract response and strips unrelated properties', () => {
    const reply = 'Result:\n```json\n{"status":"ok","fields":{"websiteurl":"https://example.com","industrycode":"12","unexpected":"drop"},"marketingInsight":"Insight","unexpected":"drop"}\n```';

    expect(extractEnrichmentJson(reply)).toEqual({
      status: 'ok',
      fields: { websiteurl: 'https://example.com', industrycode: 12 },
      marketingInsight: 'Insight',
    });
  });

  it('accepts null when the public industry has no reasonable option mapping', () => {
    const reply = '{"status":"ok","fields":{"industrycode":null,"description":"A verified profile."},"marketingInsight":""}';

    expect(extractEnrichmentJson(reply)).toEqual({
      status: 'ok',
      fields: { description: 'A verified profile.' },
      marketingInsight: '',
    });
  });

  it('rejects repaired JSON that does not satisfy the enrichment contract', () => {
    expect(extractEnrichmentJson('{"fields":{"description":"Missing status"}}')).toBeNull();
    expect(extractEnrichmentJson('{"status":"skipped","reason":"","fields":{}}')).toBeNull();
    expect(extractEnrichmentJson('{"status":"ok","fields":{},"marketingInsight":""}')).toBeNull();
    expect(extractEnrichmentJson('{"status":"ok","fields":{"industrycode":99}}')).toBeNull();
  });

  it('persists the canonical industry option and granular address through the existing account adapter', async () => {
    const account = { id: 'account-1', name1: 'Contoso', ownerid: 'owner-1' };

    await applyEnrichmentToAccount(account, {
      status: 'ok',
      fields: {
        industrycode: 12,
        address1_line1: '1 Factory Road',
        address1_city: 'Nantong',
      },
    });

    expect(serviceMocks.accountUpdate).toHaveBeenCalledWith('account-1', {
      industry: '12',
      addressLine1: '1 Factory Road',
      addressCity: 'Nantong',
    });
  });

  it('stores an insight-only result without issuing an empty account update', async () => {
    const account = { id: 'account-1', name1: 'Contoso', ownerid: 'owner-1' };

    const updated = await applyEnrichmentToAccount(account, {
      status: 'ok',
      marketingInsight: '**Industry trends:** Verified facts.',
    });

    expect(serviceMocks.accountUpdate).not.toHaveBeenCalled();
    expect(serviceMocks.summaryCreate).toHaveBeenCalledWith(expect.objectContaining({
      entityID: 'account-1',
      entityType: 'account',
      type: 'marketing',
      summary: '**Industry trends:** Verified facts.',
    }));
    expect(updated).toBe(account);
  });
});
