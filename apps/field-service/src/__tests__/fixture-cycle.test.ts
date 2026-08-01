import { describe, expect, it, vi } from 'vitest';
import { fixtureCycle, localDayKey } from '@/data/local/fixture-cycle';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    values,
  };
}

describe('localDayKey', () => {
  it('uses the device calendar day rather than UTC', () => {
    expect(localDayKey(new Date(2026, 6, 31, 0, 5))).toBe('2026-07-31');
  });
});

describe('fixtureCycle', () => {
  it('resets a container that has never loaded this fixture baseline', () => {
    expect(fixtureCycle('workorders', memoryStorage()).shouldReset).toBe(true);
  });

  it('preserves same-day local edits after the baseline has been marked ready', () => {
    const storage = memoryStorage();
    const first = fixtureCycle('workorders', storage);
    first.markReady();

    expect(fixtureCycle('workorders', storage).shouldReset).toBe(false);
  });

  it('resets stale fixture data from a prior calendar day', () => {
    const storage = memoryStorage({ 'fs-fixture-day-v3:workorders': '2026-07-30' });
    expect(fixtureCycle('workorders', storage).shouldReset).toBe(true);
  });

  it('scopes customers and work orders independently', () => {
    const today = localDayKey();
    const storage = memoryStorage({ 'fs-fixture-day-v3:workorders': today });

    expect(fixtureCycle('workorders', storage).shouldReset).toBe(false);
    expect(fixtureCycle('customers', storage).shouldReset).toBe(true);
  });

  it('still asks for a reset when localStorage is unavailable', () => {
    expect(fixtureCycle('workorders', null).shouldReset).toBe(true);
  });
});
