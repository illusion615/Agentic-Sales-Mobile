import { describe, it, expect } from 'vitest';
import { requireCreated } from '@/generated/services/_adapter-utils';

interface TestRow {
  crf5c_aisummaryid: string;
  crf5c_entityid?: string;
}

describe('requireCreated (strict SDK contract guard)', () => {
  it('returns the row when canonical PK is present', () => {
    const row: TestRow = { crf5c_aisummaryid: 'guid-1', crf5c_entityid: 'e' };
    const out = requireCreated(row, 'crf5c_aisummaryid', 'AISummary');
    expect(out.crf5c_aisummaryid).toBe('guid-1');
  });

  it('throws with diagnostic (returned keys) when PK is missing', () => {
    const row = { something: 'else', foo: 'bar' } as unknown as TestRow;
    expect(() => requireCreated(row, 'crf5c_aisummaryid', 'AISummary'))
      .toThrowError(/Row keys actually returned: \[something, foo\]/);
  });

  it('throws when data is null/undefined', () => {
    expect(() => requireCreated(undefined, 'crf5c_aisummaryid' as never, 'AISummary'))
      .toThrowError(/no row body/);
  });

  it('does NOT silently recover from schema-casing variants (contract is strict)', () => {
    const row = { crf5c_AISummaryId: 'guid-2' } as unknown as TestRow;
    expect(() => requireCreated(row, 'crf5c_aisummaryid', 'AISummary'))
      .toThrowError(/crf5c_AISummaryId/);
  });
});
