import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpportunityService } from '@/generated/services/opportunity-service';

const mocks = vi.hoisted(() => ({
  createRecordAsync: vi.fn(),
  retrieveMultipleRecordsAsync: vi.fn(),
}));

vi.mock('@microsoft/power-apps/data', () => ({
  getClient: () => ({
    createRecordAsync: mocks.createRecordAsync,
    retrieveMultipleRecordsAsync: mocks.retrieveMultipleRecordsAsync,
  }),
}));

const baseInput = {
  name1: '阿特斯储能CRM',
  account: { id: 'account-1', name1: '阿特斯' },
  totalamount: 0,
  stage: 'prospecting',
  confidence: 50,
  ownerid: 'owner-1',
};

describe('OpportunityService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('binds the currency lookup with its lowercase navigation property name', async () => {
    mocks.createRecordAsync.mockResolvedValue({
      success: true,
      data: { crf5c_opportunity1id: 'opp-1', crf5c_name: '阿特斯储能CRM' },
    });

    await OpportunityService.create({
      ...baseInput,
      currencyId: 'currency-1',
    } as Parameters<typeof OpportunityService.create>[0]);

    const [, payload] = mocks.createRecordAsync.mock.calls[0];
    // Dataverse matches @odata.bind keys case-sensitively against the navigation
    // property name. The capitalized schema name the generated model declares is
    // rejected with 0x80048d19 and fails the whole create.
    expect(payload).toHaveProperty(
      'transactioncurrencyid@odata.bind',
      '/transactioncurrencies(currency-1)',
    );
    expect(payload).not.toHaveProperty('TransactionCurrencyId@odata.bind');
    expect(payload).toHaveProperty('biz_Account@odata.bind', '/accounts(account-1)');
  });

  it('omits the currency bind when no currency is selected', async () => {
    mocks.createRecordAsync.mockResolvedValue({
      success: true,
      data: { crf5c_opportunity1id: 'opp-1', crf5c_name: '阿特斯储能CRM' },
    });

    await OpportunityService.create(baseInput as Parameters<typeof OpportunityService.create>[0]);

    const [, payload] = mocks.createRecordAsync.mock.calls[0];
    expect(Object.keys(payload).some((k) => k.toLowerCase().startsWith('transactioncurrencyid'))).toBe(false);
  });

  it('surfaces the Dataverse message when the SDK reports a plain-object failure', async () => {
    mocks.createRecordAsync.mockResolvedValue({
      success: false,
      error: { message: "An undeclared property 'TransactionCurrencyId' ...", status: 400, requestId: 'req-1' },
    });

    await expect(
      OpportunityService.create(baseInput as Parameters<typeof OpportunityService.create>[0]),
    ).rejects.toThrow(/undeclared property .*HTTP 400/s);
  });
});
