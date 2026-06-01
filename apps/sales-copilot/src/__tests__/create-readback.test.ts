/**
 * requireCreated / requireId tests — validates Dataverse create guards.
 */
import { describe, it, expect } from 'vitest';
import { requireCreated, requireId } from '@/generated/services/_adapter-utils';

describe('requireCreated', () => {
  it('returns data when PK field present', () => {
    const row = { crf5c_testid: 'guid-123', name: 'test' };
    const result = requireCreated(row, 'crf5c_testid', 'Test');
    expect(result.crf5c_testid).toBe('guid-123');
  });

  it('throws when data is null', () => {
    expect(() => requireCreated(null, 'crf5c_testid' as never, 'Test'))
      .toThrowError(/no row body/);
  });

  it('throws when data is undefined', () => {
    expect(() => requireCreated(undefined, 'crf5c_testid' as never, 'Test'))
      .toThrowError(/no row body/);
  });

  it('throws when PK field is missing', () => {
    const row = { otherId: 'guid-999' };
    expect(() => requireCreated(row, 'crf5c_testid' as never, 'Test'))
      .toThrowError(/without its primary key/);
  });
});

describe('requireId', () => {
  it('passes for valid id', () => {
    expect(() => requireId('valid-id', 'get', 'Test')).not.toThrow();
  });

  it('throws for empty id', () => {
    expect(() => requireId('', 'get', 'Test')).toThrowError(/empty id/);
  });

  it('throws for null id', () => {
    expect(() => requireId(null, 'update', 'Test')).toThrowError(/empty id/);
  });

  it('throws for undefined id', () => {
    expect(() => requireId(undefined, 'delete', 'Test')).toThrowError(/empty id/);
  });
});
