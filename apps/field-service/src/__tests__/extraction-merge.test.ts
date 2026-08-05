import { describe, expect, it } from 'vitest';
import { mergeCandidates, type FieldCandidate } from '@/domain/extraction';
import type { FieldValue } from '@/domain/form-schema';

const correction: FieldCandidate = {
  name: 'fault',
  value: '传感器老化',
  confidence: 0.92,
  evidenceIds: ['note-2'],
};

describe('mergeCandidates', () => {
  it('updates unlocked AI content when later evidence corrects it', () => {
    const existing: FieldValue[] = [{
      name: 'fault',
      value: '水质波动',
      source: 'ai',
      confidence: 0.7,
      evidenceIds: ['note-1'],
    }];

    expect(mergeCandidates(existing, [correction])).toEqual([{
      name: 'fault',
      value: '传感器老化',
      source: 'ai',
      confidence: 0.92,
      evidenceIds: ['note-2'],
    }]);
  });

  it('does not overwrite a value the technician entered', () => {
    const existing: FieldValue[] = [{ name: 'fault', value: '人工判断', source: 'user' }];
    expect(mergeCandidates(existing, [correction])).toEqual(existing);
  });

  it('does not overwrite AI content after the technician locked it', () => {
    const locked: FieldValue[] = [{ name: 'fault', value: '已确定结论', source: 'ai-locked', evidenceIds: ['note-1'] }];
    expect(mergeCandidates(locked, [correction])).toEqual(locked);
  });

  it('does not overwrite a value prefilled from the work order', () => {
    const existing: FieldValue[] = [{ name: 'fault', value: '工单带入', source: 'prefill' }];
    expect(mergeCandidates(existing, [correction])).toEqual(existing);
  });
});
