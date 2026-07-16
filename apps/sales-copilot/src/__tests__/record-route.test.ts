import { describe, expect, it } from 'vitest';
import { recordDetailRoute, recordListRoute } from '@/lib/record-route';

describe('record routes', () => {
  it.each([
    ['account', '/accounts', '/accounts/account-1'],
    ['opportunity', '/opportunities', '/opportunities/opportunity-1'],
    ['activity', '/activities', '/activities/activity-1'],
    ['contact', '/contacts', '/contacts/contact-1'],
  ] as const)('maps %s records to their own list and detail routes', (type, list, detail) => {
    expect(recordListRoute(type)).toBe(list);
    expect(recordDetailRoute(type, `${type}-1`)).toBe(detail);
  });

  it('rejects a missing record id instead of silently navigating elsewhere', () => {
    expect(() => recordDetailRoute('contact', '  ')).toThrow(
      'Cannot build contact detail route: record id is required',
    );
  });
});