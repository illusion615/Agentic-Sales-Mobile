import { describe, it, expect } from 'vitest';
import { pickLabel } from '@/lib/i18n';

describe('pickLabel', () => {
  it('returns the locale-specific value for a valid label', () => {
    expect(pickLabel({ zh: '客户', en: 'Account' }, 'zh-Hans')).toBe('客户');
    expect(pickLabel({ zh: '客户', en: 'Account' }, 'en-US')).toBe('Account');
  });

  it('falls back to English for a missing locale variant', () => {
    expect(pickLabel({ zh: '客户', en: 'Account' }, 'de-DE')).toBe('Account');
    expect(pickLabel({ zh: '客户', en: 'Account', de: 'Konto' }, 'de-DE')).toBe('Konto');
  });

  it('never throws when the label is undefined/null (unmapped label map key)', () => {
    // Regression: a missing key in a data-driven label map (e.g. EntityTypeLabels[type])
    // must degrade to an empty string, not white-screen the whole app.
    expect(pickLabel(undefined, 'zh-Hans')).toBe('');
    expect(pickLabel(null, 'en-US')).toBe('');
  });
});
