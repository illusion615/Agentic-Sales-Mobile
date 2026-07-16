import { describe, expect, it } from 'vitest';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import { resolveActivityRelations } from '@/lib/activity-relations';

const baseActivity: Activity = {
  id: 'activity-1',
  title: 'Customer follow-up',
  type: 'visit',
  scheduleddate: '2026-07-14T00:00:00Z',
  status: 'open',
  ownerid: 'user-1',
};

const opportunity: Opportunity = {
  id: 'opportunity-1',
  name1: 'Current opportunity name',
  account: { id: 'account-1', name1: 'Contoso' },
  ownerid: 'user-1',
  stage: 'prospecting',
  totalamount: 100,
};

const contact: Contact = {
  id: 'contact-1',
  fullname: 'Avery Smith',
  account: { id: 'account-2', name1: 'Fabrikam' },
};

describe('resolveActivityRelations', () => {
  it('derives account and current opportunity name for an opportunity-linked activity', () => {
    const source: Activity = {
      ...baseActivity,
      opportunity: { id: opportunity.id, name1: 'Stale lookup name' },
    };

    expect(resolveActivityRelations(source, [opportunity])).toEqual({
      ...source,
      account: { id: 'account-1', name1: 'Contoso' },
      opportunity: { id: 'opportunity-1', name1: 'Current opportunity name' },
    });
    expect(source.account).toBeUndefined();
  });

  it('keeps an account-only activity unchanged', () => {
    const source: Activity = {
      ...baseActivity,
      account: { id: 'account-2', name1: 'Fabrikam' },
    };

    expect(resolveActivityRelations(source, [opportunity])).toBe(source);
  });

  it('derives account and current contact name for a contact-linked activity', () => {
    const source: Activity = {
      ...baseActivity,
      contact: { id: contact.id, fullname: 'Stale contact name' },
    };

    expect(resolveActivityRelations(source, [], [contact])).toEqual({
      ...source,
      account: { id: 'account-2', name1: 'Fabrikam' },
      contact: { id: 'contact-1', fullname: 'Avery Smith' },
    });
  });

  it('keeps the stored lookup when its opportunity is not available', () => {
    const source: Activity = {
      ...baseActivity,
      opportunity: { id: 'missing-opportunity', name1: 'Stored name' },
    };

    expect(resolveActivityRelations(source, [])).toBe(source);
  });
});
