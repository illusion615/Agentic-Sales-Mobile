import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from '@/generated/services/account-service';

const mocks = vi.hoisted(() => ({
  updateRecordAsync: vi.fn(),
  retrieveRecordAsync: vi.fn(),
}));

vi.mock('@microsoft/power-apps/data', () => ({
  getClient: () => ({
    updateRecordAsync: mocks.updateRecordAsync,
    retrieveRecordAsync: mocks.retrieveRecordAsync,
  }),
}));

describe('AccountService enrichment address mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes each structured address field without collapsing it into line 1', async () => {
    mocks.updateRecordAsync.mockResolvedValue({
      success: true,
      data: {
        accountid: 'account-1',
        name: 'Contoso',
        statecode: 0,
        address1_composite: '1086 Bihua Road, Nantong, Jiangsu, China',
        address1_line1: '1086 Bihua Road',
        address1_city: 'Nantong',
        address1_stateorprovince: 'Jiangsu',
        address1_country: 'China',
        address1_postalcode: '226300',
      },
    });

    const updated = await AccountService.update('account-1', {
      addressLine1: '1086 Bihua Road',
      addressCity: 'Nantong',
      addressStateOrProvince: 'Jiangsu',
      addressCountry: 'China',
      addressPostalCode: '226300',
    });

    expect(mocks.updateRecordAsync).toHaveBeenCalledWith('accounts', 'account-1', {
      address1_line1: '1086 Bihua Road',
      address1_city: 'Nantong',
      address1_stateorprovince: 'Jiangsu',
      address1_country: 'China',
      address1_postalcode: '226300',
    });
    expect(updated).toEqual(expect.objectContaining({
      address: '1086 Bihua Road, Nantong, Jiangsu, China',
      addressLine1: '1086 Bihua Road',
      addressCity: 'Nantong',
      addressStateOrProvince: 'Jiangsu',
      addressCountry: 'China',
      addressPostalCode: '226300',
    }));
  });
});
