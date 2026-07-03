import { describe, it, expect } from 'vitest';
import { parseProposal } from '@/lib/propose-changes';

describe('parseProposal', () => {
  it('parses a clean merge proposal', () => {
    const raw = JSON.stringify({
      summary: 'Merge two',
      writes: [
        { fn: 'updateActivity', args: { activityId: 'keep-1', notes: 'x' }, label: 'Update' },
        { fn: 'deleteActivity', args: { activityId: 'del-1' }, label: 'Delete' },
      ],
    });
    const p = parseProposal(raw)!;
    expect(p.writes).toHaveLength(2);
    expect(p.writes[0].fn).toBe('updateActivity');
    expect(p.writes[1].args.activityId).toBe('del-1');
    expect(p.summary).toBe('Merge two');
  });

  it('extracts JSON even when wrapped in prose/markdown fences', () => {
    const raw = 'Sure! Here you go:\n```json\n{"summary":"","writes":[{"fn":"deleteActivity","args":{"activityId":"a"},"label":""}]}\n```';
    const p = parseProposal(raw)!;
    expect(p.writes[0].fn).toBe('deleteActivity');
  });

  it('returns null for non-JSON', () => {
    expect(parseProposal('I could not decide.')).toBeNull();
  });

  it('returns null when writes is not an array', () => {
    expect(parseProposal('{"summary":{"zh":"","en":""}}')).toBeNull();
  });

  it('fills defaults for partial write entries', () => {
    const p = parseProposal('{"writes":[{"fn":"updateActivity","args":{"activityId":"x"}}]}')!;
    expect(p.writes[0].label).toBe('');
    expect(p.summary).toBe('');
  });

  it('parses followup preview sections when present', () => {
    const raw = JSON.stringify({
      summary: '',
      writes: [{ fn: 'updateActivity', args: { activityId: 'a' }, label: '' }],
      followup: [
        { kind: 'comparison', title: '保留', rows: [{ field: '描述', before: 'A', after: 'A B' }] },
        { kind: 'single', title: '删除', tone: 'danger', rows: [{ field: '标题', value: 'dup' }] },
      ],
    });
    const p = parseProposal(raw)!;
    expect(p.followup).toHaveLength(2);
    expect(p.followup![0].kind).toBe('comparison');
    expect(p.followup![1]).toMatchObject({ kind: 'single', tone: 'danger' });
  });

  it('omits followup when the model does not emit it', () => {
    const p = parseProposal('{"writes":[{"fn":"deleteActivity","args":{"activityId":"a"}}]}')!;
    expect(p.followup).toBeUndefined();
  });
});
