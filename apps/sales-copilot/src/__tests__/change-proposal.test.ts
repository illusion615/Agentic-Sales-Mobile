import { describe, it, expect, vi } from 'vitest';
import { applyProposal, validateProposal, sanitizeFollowup, type ChangeProposal } from '@/lib/change-proposal';

const mergeProposal: ChangeProposal = {
  summary: 'Merge two duplicate visits',
  writes: [
    { fn: 'updateActivity', args: { activityId: 'keep-1', notes: 'merged' }, label: 'Update kept record' },
    { fn: 'deleteActivity', args: { activityId: 'del-1' }, label: 'Delete duplicate' },
  ],
};

describe('validateProposal', () => {
  it('accepts a well-formed merge proposal', () => {
    expect(validateProposal(mergeProposal)).toBeNull();
  });

  it('rejects an empty proposal', () => {
    expect(validateProposal({ summary: '', writes: [] })).toMatch(/empty/);
  });

  it('rejects a non-write function (e.g. a query smuggled in)', () => {
    const bad: ChangeProposal = { summary: '', writes: [{ fn: 'queryActivities', args: { activityId: 'x' }, label: '' }] };
    expect(validateProposal(bad)).toMatch(/disallowed/);
  });

  it('rejects a write with no concrete record id', () => {
    const bad: ChangeProposal = { summary: '', writes: [{ fn: 'deleteActivity', args: { activityTitle: 'some visit' }, label: '' }] };
    expect(validateProposal(bad)).toMatch(/no concrete record id/);
  });
});

describe('applyProposal', () => {
  it('applies every write in order when all succeed', async () => {
    const exec = vi.fn().mockResolvedValue({ success: true });
    const res = await applyProposal(mergeProposal, exec);
    expect(res.ok).toBe(true);
    expect(res.done).toBe(2);
    expect(exec.mock.calls[0][0]).toBe('updateActivity');
    expect(exec.mock.calls[1][0]).toBe('deleteActivity');
  });

  it('stops at the first failing write and reports partial progress', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'boom' });
    const res = await applyProposal(mergeProposal, exec);
    expect(res.ok).toBe(false);
    expect(res.done).toBe(1);
    expect(res.failedAt).toBe(1);
    expect(res.error).toBe('boom');
  });

  it('refuses a disallowed write function without executing it', async () => {
    const exec = vi.fn().mockResolvedValue({ success: true });
    const bad: ChangeProposal = { summary: '', writes: [{ fn: 'dropTable', args: { activityId: 'x' }, label: '' }] };
    const res = await applyProposal(bad, exec);
    expect(res.ok).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('sanitizeFollowup', () => {
  it('returns undefined for non-arrays and empty input', () => {
    expect(sanitizeFollowup(undefined)).toBeUndefined();
    expect(sanitizeFollowup('nope')).toBeUndefined();
    expect(sanitizeFollowup([])).toBeUndefined();
  });

  it('keeps comparison / single / list sections and stringifies every value', () => {
    const out = sanitizeFollowup([
      { kind: 'comparison', title: 'X', rows: [{ field: 'amt', before: 10, after: 20 }] },
      { kind: 'single', title: 'Del', tone: 'danger', rows: [{ field: 'id', value: 'a1' }] },
      { kind: 'list', title: 'L', columns: ['a'], rows: [['1'], 2] },
    ])!;
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ kind: 'comparison', rows: [{ field: 'amt', before: '10', after: '20' }] });
    expect(out[1]).toMatchObject({ kind: 'single', tone: 'danger' });
    const list = out[2];
    if (list.kind === 'list') expect(list.rows).toEqual([['1'], ['2']]);
  });

  it('drops unknown section kinds (no arbitrary components)', () => {
    const out = sanitizeFollowup([{ kind: 'script', title: 'x', rows: [] }, { kind: 'single', title: 'ok', rows: [] }]);
    expect(out).toHaveLength(1);
    expect(out![0].kind).toBe('single');
  });
});
