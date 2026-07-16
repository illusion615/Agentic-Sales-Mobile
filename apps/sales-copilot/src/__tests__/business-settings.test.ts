import { describe, expect, it } from 'vitest';
import {
  parseBusinessSettings,
  serializeBusinessSettings,
  quarterTargetFor,
  currentQuarter,
  targetKey,
  businessSettingsKey,
  DEFAULT_RISK_THRESHOLD,
  type BusinessSettings,
} from '@/lib/business-settings';

describe('business-settings parse/defaults', () => {
  it('returns safe defaults for empty/invalid input', () => {
    expect(parseBusinessSettings(undefined)).toEqual({ targets: {}, aiSummaryEnabled: true, riskThreshold: DEFAULT_RISK_THRESHOLD });
    expect(parseBusinessSettings('not json')).toEqual({ targets: {}, aiSummaryEnabled: true, riskThreshold: DEFAULT_RISK_THRESHOLD });
  });

  it('keeps valid targets and drops invalid ones', () => {
    const s = parseBusinessSettings(JSON.stringify({ targets: { '2026-Q3': 500000, '2026-Q4': -1, bad: 'x' }, aiSummaryEnabled: false, riskThreshold: 40 }));
    expect(s.targets).toEqual({ '2026-Q3': 500000 });
    expect(s.aiSummaryEnabled).toBe(false);
    expect(s.riskThreshold).toBe(40);
  });

  it('clamps an out-of-range risk threshold to the default', () => {
    expect(parseBusinessSettings(JSON.stringify({ riskThreshold: 0 })).riskThreshold).toBe(DEFAULT_RISK_THRESHOLD);
    expect(parseBusinessSettings(JSON.stringify({ riskThreshold: 150 })).riskThreshold).toBe(DEFAULT_RISK_THRESHOLD);
    expect(parseBusinessSettings(JSON.stringify({ riskThreshold: 33 })).riskThreshold).toBe(33);
  });

  it('round-trips through serialize', () => {
    const s: BusinessSettings = { targets: { '2026-Q1': 100 }, aiSummaryEnabled: false, riskThreshold: 60 };
    expect(parseBusinessSettings(serializeBusinessSettings(s))).toEqual(s);
  });
});

describe('quarter helpers', () => {
  it('derives year + quarter from a date', () => {
    expect(currentQuarter(new Date(2026, 6, 16))).toEqual({ year: 2026, quarter: 3 });
    expect(currentQuarter(new Date(2026, 0, 1))).toEqual({ year: 2026, quarter: 1 });
    expect(currentQuarter(new Date(2026, 11, 31))).toEqual({ year: 2026, quarter: 4 });
  });

  it('resolves a configured quarter target, ignoring zero/unset', () => {
    const s = parseBusinessSettings(JSON.stringify({ targets: { [targetKey(2026, 3)]: 750000, [targetKey(2026, 4)]: 0 } }));
    expect(quarterTargetFor(s, 2026, 3)).toBe(750000);
    expect(quarterTargetFor(s, 2026, 4)).toBeUndefined();
    expect(quarterTargetFor(s, 2026, 1)).toBeUndefined();
  });

  it('namespaces the setting key per user', () => {
    expect(businessSettingsKey('abc-123')).toBe('business_settings:abc-123');
  });
});
