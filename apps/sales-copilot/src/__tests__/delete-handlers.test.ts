import { describe, it, expect, beforeEach, vi } from 'vitest';

// Isolate the handler from the service internals — assert only the handler's contract.
const del = vi.hoisted(() => vi.fn());
vi.mock('@/generated/services/activity-service', () => ({
  ActivityService: { delete: del },
}));

import '@/lib/functions/delete-handlers'; // self-registers the handler
import { getHandler } from '@/lib/functions/handler-registry';

describe('deleteActivity handler', () => {
  beforeEach(() => {
    del.mockReset();
    del.mockResolvedValue(undefined);
  });

  it('rejects when activityId is missing (never deletes without a concrete id)', async () => {
    const h = getHandler('deleteActivity')!;
    const res = await h({}, {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/activityId/);
    expect(del).not.toHaveBeenCalled();
  });

  it('never deletes by name/title alone (no fuzzy matching for deletes)', async () => {
    const h = getHandler('deleteActivity')!;
    const res = await h({ activityTitle: 'Royal London Hospital - Product Demo' }, {});
    expect(res.success).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes by concrete id and invalidates the activity list', async () => {
    const h = getHandler('deleteActivity')!;
    const res = await h({ activityId: 'act-1' }, {});
    expect(del).toHaveBeenCalledWith('act-1');
    expect(res.success).toBe(true);
    expect((res.data as { activityId?: string }).activityId).toBe('act-1');
    expect(res.invalidateQueries).toContain('activity-list');
  });
});
