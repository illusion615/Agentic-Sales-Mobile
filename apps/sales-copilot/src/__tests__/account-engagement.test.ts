import { describe, expect, it } from 'vitest';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import {
  contactRecencyStatus,
  daysSinceContact,
  formatLastContact,
  latestContactByAccount,
} from '@/lib/account-engagement';

const NOW = new Date(2026, 6, 15, 14, 30);

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    title: 'Customer visit',
    type: 'visit',
    scheduleddate: '2026-07-15T00:00:00Z',
    status: 'open',
    ownerid: 'user-1',
    account: { id: 'account-1', name1: 'Contoso' },
    ...overrides,
  };
}

describe('account engagement', () => {
  it('counts a logged open activity today as contact today', () => {
    const latest = latestContactByAccount([activity()], [], [], NOW);

    expect(latest.get('account-1')).toBe('2026-07-15T00:00:00Z');
    expect(daysSinceContact(latest.get('account-1'), NOW)).toBe(0);
  });

  it('includes completed activities but excludes cancelled and future activities', () => {
    const latest = latestContactByAccount([
      activity({ id: 'completed', scheduleddate: '2026-07-13T00:00:00Z', status: 'completed' }),
      activity({ id: 'cancelled', scheduleddate: '2026-07-15T00:00:00Z', status: 'canceled' }),
      activity({ id: 'future', scheduleddate: '2026-07-16T00:00:00Z', status: 'open' }),
    ], [], [], NOW);

    expect(latest.get('account-1')).toBe('2026-07-13T00:00:00Z');
    expect(daysSinceContact(latest.get('account-1'), NOW)).toBe(2);
  });

  it('derives account ownership through opportunity and contact relationships', () => {
    const opportunities: Opportunity[] = [{
      id: 'opportunity-1',
      name1: 'Modernization',
      account: { id: 'account-2', name1: 'Fabrikam' },
      ownerid: 'user-1',
      stage: 'prospecting',
      totalamount: 100,
    }];
    const contacts: Contact[] = [{
      id: 'contact-1',
      fullname: 'Avery Smith',
      account: { id: 'account-3', name1: 'Adventure Works' },
    }];

    const latest = latestContactByAccount([
      activity({
        id: 'opportunity-activity',
        account: undefined,
        opportunity: { id: 'opportunity-1', name1: 'Modernization' },
        scheduleddate: '2026-07-14T00:00:00Z',
      }),
      activity({
        id: 'contact-activity',
        account: undefined,
        contact: undefined,
        contacts: [{ id: 'contact-1', fullname: 'Avery Smith', role: 'required' }],
        scheduleddate: '2026-07-15T00:00:00Z',
      }),
    ], opportunities, contacts, NOW);

    expect(latest.get('account-2')).toBe('2026-07-14T00:00:00Z');
    expect(latest.get('account-3')).toBe('2026-07-15T00:00:00Z');
  });

  it('uses calendar days, returns null for no/future contact, and classifies consistently', () => {
    expect(daysSinceContact(undefined, NOW)).toBeNull();
    expect(daysSinceContact('invalid', NOW)).toBeNull();
    expect(daysSinceContact('2026-07-16T00:00:00Z', NOW)).toBeNull();
    expect(daysSinceContact('2026-07-15T23:59:59Z', NOW)).toBe(0);

    expect(contactRecencyStatus(null)).toBe('never');
    expect(contactRecencyStatus(7)).toBe('recent');
    expect(contactRecencyStatus(14)).toBe('active');
    expect(contactRecencyStatus(30)).toBe('cooling');
    expect(contactRecencyStatus(31)).toBe('at-risk');
  });

  it('formats last contact as natural human language in every supported locale', () => {
    expect(formatLastContact(0, 'en-US')).toBe('Today');
    expect(formatLastContact(1, 'en-US')).toBe('Yesterday');
    expect(formatLastContact(2, 'en-US')).toBe('2 days ago');
    expect(formatLastContact(null, 'en-US')).toBe('Never contacted');

    expect(formatLastContact(0, 'zh-Hans')).toBe('今天');
    expect(formatLastContact(1, 'zh-Hans')).toBe('昨天');
    expect(formatLastContact(2, 'zh-Hans')).toBe('前天');
    expect(formatLastContact(null, 'zh-Hans')).toBe('从未联系');

    expect(formatLastContact(0, 'de-DE')).toBe('Heute');
    expect(formatLastContact(0, 'fr-FR')).toBe("Aujourd’hui");
    expect(formatLastContact(0, 'es-ES')).toBe('Hoy');
  });
});
