import { describe, expect, it } from 'vitest';
import {
  activeWorkOrder,
  isUnderway,
  startRefusal,
  todayRange,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from '@/domain/work-order';

function workOrder(id: string, status: WorkOrderStatus, scheduledStart?: string): WorkOrderSummary {
  return {
    id,
    number: id.toUpperCase(),
    status,
    priority: 'normal',
    customerId: 'acc',
    customerName: 'Customer',
    address: { line1: 'somewhere' },
    scheduledStart,
  };
}

describe('isUnderway', () => {
  it('counts travelling as occupied, because the van is already committed', () => {
    expect(isUnderway({ status: 'travelling' })).toBe(true);
    expect(isUnderway({ status: 'in-progress' })).toBe(true);
  });

  it('leaves scheduled and closed work free', () => {
    for (const status of ['scheduled', 'unscheduled', 'completed', 'cancelled'] as const) {
      expect(isUnderway({ status })).toBe(false);
    }
  });
});

describe('activeWorkOrder', () => {
  it('finds nothing when the day has not started', () => {
    expect(activeWorkOrder([workOrder('a', 'scheduled')])).toBeUndefined();
  });

  it('does not let a paused job occupy the active slot', () => {
    expect(activeWorkOrder([workOrder('a', 'paused'), workOrder('b', 'scheduled')])).toBeUndefined();
    expect(startRefusal(workOrder('b', 'scheduled'), undefined)).toBeNull();
  });

  it('returns the one job under way', () => {
    const active = activeWorkOrder([workOrder('a', 'scheduled'), workOrder('b', 'in-progress')]);
    expect(active?.id).toBe('b');
  });

  /** A backend that reports two must not make the screen pick arbitrarily. */
  it('settles on the earliest when a backend reports several', () => {
    const active = activeWorkOrder([
      workOrder('late', 'in-progress', '2026-07-31T14:00:00.000Z'),
      workOrder('early', 'travelling', '2026-07-31T09:00:00.000Z'),
    ]);
    expect(active?.id).toBe('early');
  });
});

describe('startRefusal', () => {
  it('allows a start when nothing else is under way', () => {
    expect(startRefusal(workOrder('a', 'scheduled'), undefined)).toBeNull();
  });

  it('allows a paused job to be resumed when no other job is active', () => {
    expect(startRefusal(workOrder('a', 'paused'), undefined)).toBeNull();
  });

  it('lets the job already under way carry on', () => {
    const job = workOrder('a', 'in-progress');
    expect(startRefusal(job, job)).toBe('already-underway');
  });

  it('refuses a second job while another is under way', () => {
    expect(startRefusal(workOrder('a', 'scheduled'), workOrder('b', 'in-progress'))).toBe(
      'another-underway',
    );
  });

  it('refuses closed work regardless of what else is happening', () => {
    expect(startRefusal(workOrder('a', 'completed'), undefined)).toBe('closed');
    expect(startRefusal(workOrder('a', 'cancelled'), workOrder('b', 'in-progress'))).toBe('closed');
  });
});

describe('todayRange', () => {
  it('spans the local day so the same day always keys the same query', () => {
    const range = todayRange(new Date(2026, 6, 31, 15, 30));
    const from = new Date(range.from);
    const to = new Date(range.to);

    expect(from.getHours()).toBe(0);
    expect(from.getDate()).toBe(31);
    expect(to.getDate()).toBe(31);
    expect(to.getHours()).toBe(23);
    expect(todayRange(new Date(2026, 6, 31, 8, 0))).toEqual(range);
  });
});
