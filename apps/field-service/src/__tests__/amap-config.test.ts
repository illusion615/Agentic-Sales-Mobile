import { describe, expect, it, vi } from 'vitest';

vi.mock('@/generated/services/EnvironmentvariabledefinitionsService', () => ({
  EnvironmentvariabledefinitionsService: { getAll: vi.fn() },
}));
vi.mock('@/generated/services/EnvironmentvariablevaluesService', () => ({
  EnvironmentvariablevaluesService: { getAll: vi.fn() },
}));

const { AMAP_KEY_SCHEMA, resolveAMapKey } = await import('@/data/amap-config');

describe('AMap environment configuration', () => {
  it('uses the current environment value before the definition default', () => {
    expect(
      resolveAMapKey(
        [{ schemaname: AMAP_KEY_SCHEMA, defaultvalue: 'default-key' }],
        [{ schemaname: AMAP_KEY_SCHEMA, value: 'current-key' }],
      ),
    ).toBe('current-key');
  });

  it('falls back to the definition default', () => {
    expect(
      resolveAMapKey([{ schemaname: AMAP_KEY_SCHEMA, defaultvalue: 'default-key' }], []),
    ).toBe('default-key');
  });

  it('ignores unrelated and blank rows', () => {
    expect(
      resolveAMapKey(
        [
          { schemaname: 'other', defaultvalue: 'wrong' },
          { schemaname: AMAP_KEY_SCHEMA, defaultvalue: '  ' },
        ],
        [{ schemaname: AMAP_KEY_SCHEMA, value: '' }],
      ),
    ).toBe('');
  });
});
