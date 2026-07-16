import { describe, it, expect } from 'vitest';
import {
  activityStatus,
  isPending,
  isCompleted,
  isCanceled,
  isClosed,
  isOverdue,
  daysOverdue,
  groupByStatus,
  normalizeQueryStatus,
} from '@/lib/activity-status';

const NOW = new Date('2026-07-14T09:00:00');
const YESTERDAY = '2026-07-13T08:00:00';
const TOMORROW = '2026-07-15T08:00:00';

describe('activityStatus normalization', () => {
  it('maps the three canonical states', () => {
    expect(activityStatus({ status: 'open' })).toBe('open');
    expect(activityStatus({ status: 'completed' })).toBe('completed');
    expect(activityStatus({ status: 'canceled' })).toBe('canceled');
  });
  it('treats unknown/missing status as open (pending)', () => {
    expect(activityStatus({})).toBe('open');
    expect(activityStatus({ status: 'weird' })).toBe('open');
  });
});

describe('normalizeQueryStatus — reconciles agent status words with Activity.status', () => {
  it('maps the OBSOLETE draft/confirmed vocabulary to open (the today-agenda bug)', () => {
    expect(normalizeQueryStatus('draft')).toBe('open');
    expect(normalizeQueryStatus('confirmed')).toBe('open');
    expect(normalizeQueryStatus('pending')).toBe('open');
    expect(normalizeQueryStatus('open')).toBe('open');
  });
  it('maps completed and canceled variants (incl. cancelled + Chinese)', () => {
    expect(normalizeQueryStatus('completed')).toBe('completed');
    expect(normalizeQueryStatus('done')).toBe('completed');
    expect(normalizeQueryStatus('cancelled')).toBe('canceled');
    expect(normalizeQueryStatus('canceled')).toBe('canceled');
    expect(normalizeQueryStatus('\u5df2\u5b8c\u6210')).toBe('completed');
    expect(normalizeQueryStatus('\u5f85\u529e')).toBe('open');
  });
  it('returns undefined for empty/all/unknown so the query does not over-filter', () => {
    expect(normalizeQueryStatus('')).toBeUndefined();
    expect(normalizeQueryStatus('all')).toBeUndefined();
    expect(normalizeQueryStatus(undefined)).toBeUndefined();
    expect(normalizeQueryStatus('banana')).toBeUndefined();
  });
});

describe('status predicates — canceled is NEITHER pending NOR completed', () => {
  const canceled = { status: 'canceled' as const };
  it('a canceled activity is not pending (the list bug this guards)', () => {
    expect(isPending(canceled)).toBe(false);
    expect(isCompleted(canceled)).toBe(false);
    expect(isCanceled(canceled)).toBe(true);
    expect(isClosed(canceled)).toBe(true);
  });
  it('open is the only pending state', () => {
    expect(isPending({ status: 'open' })).toBe(true);
    expect(isClosed({ status: 'open' })).toBe(false);
  });
  it('completed is closed but not pending', () => {
    expect(isCompleted({ status: 'completed' })).toBe(true);
    expect(isPending({ status: 'completed' })).toBe(false);
    expect(isClosed({ status: 'completed' })).toBe(true);
  });
});

describe('isOverdue — only still-pending, past-dated items', () => {
  it('pending + before today = overdue', () => {
    expect(isOverdue({ status: 'open', scheduleddate: YESTERDAY }, NOW)).toBe(true);
  });
  it('completed or canceled past items are never overdue', () => {
    expect(isOverdue({ status: 'completed', scheduleddate: YESTERDAY }, NOW)).toBe(false);
    expect(isOverdue({ status: 'canceled', scheduleddate: YESTERDAY }, NOW)).toBe(false);
  });
  it('future pending items are not overdue', () => {
    expect(isOverdue({ status: 'open', scheduleddate: TOMORROW }, NOW)).toBe(false);
  });
  it('missing/invalid date is not overdue', () => {
    expect(isOverdue({ status: 'open' }, NOW)).toBe(false);
    expect(isOverdue({ status: 'open', scheduleddate: 'not-a-date' }, NOW)).toBe(false);
  });
  it('daysOverdue counts whole days, 0 when not overdue', () => {
    expect(daysOverdue({ status: 'open', scheduleddate: YESTERDAY }, NOW)).toBe(1);
    expect(daysOverdue({ status: 'completed', scheduleddate: YESTERDAY }, NOW)).toBe(0);
  });
});

describe('groupByStatus — canceled gets its own bucket', () => {
  it('splits into three order-preserving buckets', () => {
    const list = [
      { id: 'a', status: 'open' },
      { id: 'b', status: 'completed' },
      { id: 'c', status: 'canceled' },
      { id: 'd', status: 'open' },
    ];
    const { pending, completed, canceled } = groupByStatus(list);
    expect(pending.map((x) => x.id)).toEqual(['a', 'd']);
    expect(completed.map((x) => x.id)).toEqual(['b']);
    expect(canceled.map((x) => x.id)).toEqual(['c']);
  });
  it('a canceled activity never appears in the pending bucket', () => {
    const { pending, canceled } = groupByStatus([{ status: 'canceled' }]);
    expect(pending).toHaveLength(0);
    expect(canceled).toHaveLength(1);
  });
});
