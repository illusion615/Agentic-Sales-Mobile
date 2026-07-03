import { describe, it, expect } from 'vitest';
import {
  isElicitableUpdate,
  hasConcreteUpdateValue,
  fieldKind,
  fieldLabel,
  enumOptions,
  updatableFields,
} from '@/lib/field-elicitation';

/**
 * Missing-parameter gate contract (boss directive 2026-07-02): when an update
 * tool resolves its subject but carries no concrete value, elicit via the right
 * control (enum → chips, scalar → input) instead of hard-failing. This module is
 * the "dictionary" source of truth, derived from the registry.
 */

describe('isElicitableUpdate', () => {
  it('is true for the update tools', () => {
    expect(isElicitableUpdate('updateOpportunity')).toBe(true);
    expect(isElicitableUpdate('updateActivity')).toBe(true);
    expect(isElicitableUpdate('updateAccount')).toBe(true);
    expect(isElicitableUpdate('updateContact')).toBe(true);
  });
  it('is false for non-update tools', () => {
    expect(isElicitableUpdate('queryOpportunities')).toBe(false);
    expect(isElicitableUpdate('draftOpportunity')).toBe(false);
  });
});

describe('hasConcreteUpdateValue', () => {
  it('is false when only the subject / entity-context is present (the failing case)', () => {
    expect(hasConcreteUpdateValue('updateOpportunity', {})).toBe(false);
    expect(hasConcreteUpdateValue('updateOpportunity', { opportunityId: 'x', opportunityName: 'ACME' })).toBe(false);
    // Subject pick / page context auto-inject the opp's OWN account — not a change.
    expect(hasConcreteUpdateValue('updateOpportunity', { accountId: 'a1', accountName: 'X' })).toBe(false);
  });
  it('is true when a real field value is present', () => {
    expect(hasConcreteUpdateValue('updateOpportunity', { stage: 'won' })).toBe(true);
    expect(hasConcreteUpdateValue('updateOpportunity', { amount: 100000 })).toBe(true);
  });
  it('treats empty string / empty array as no value', () => {
    expect(hasConcreteUpdateValue('updateOpportunity', { name: '' })).toBe(false);
    expect(hasConcreteUpdateValue('updateActivity', { addAttendeeNames: [] })).toBe(false);
  });
  it('counts attendee changes on activities', () => {
    expect(hasConcreteUpdateValue('updateActivity', { addAttendeeNames: ['Robert'] })).toBe(true);
  });
  it('never blocks a non-gated function', () => {
    expect(hasConcreteUpdateValue('queryOpportunities', {})).toBe(true);
  });
});

describe('fieldKind (derived from registry contract)', () => {
  it('classifies opportunity fields', () => {
    expect(fieldKind('updateOpportunity', 'stage')).toBe('enum');
    expect(fieldKind('updateOpportunity', 'amount')).toBe('number');
    expect(fieldKind('updateOpportunity', 'confidence')).toBe('number');
    expect(fieldKind('updateOpportunity', 'expectedCloseDate')).toBe('date');
    expect(fieldKind('updateOpportunity', 'name')).toBe('text');
  });
  it('classifies activity enum fields', () => {
    expect(fieldKind('updateActivity', 'status')).toBe('enum');
    expect(fieldKind('updateActivity', 'type')).toBe('enum');
    expect(fieldKind('updateActivity', 'scheduledDate')).toBe('date');
  });
});

describe('enumOptions', () => {
  it('returns all registry enum values with localized labels', () => {
    const en = enumOptions('updateOpportunity', 'stage', 'en-US');
    expect(en.map((o) => o.value)).toEqual(['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost']);
    expect(en.find((o) => o.value === 'negotiation')?.label).toBe('Negotiation');
    const zh = enumOptions('updateOpportunity', 'stage', 'zh-Hans');
    expect(zh.find((o) => o.value === 'negotiation')?.label).toBe('谈判');
  });
  it('returns activity status options', () => {
    expect(enumOptions('updateActivity', 'status', 'en-US').map((o) => o.value)).toEqual(['open', 'completed', 'canceled']);
  });
  it('is empty for a non-enum field', () => {
    expect(enumOptions('updateOpportunity', 'amount', 'en-US')).toEqual([]);
  });
});

describe('updatableFields (the "what to change?" menu)', () => {
  it('lists opportunity value fields with kinds + labels', () => {
    const fields = updatableFields('updateOpportunity', 'en-US');
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.stage.kind).toBe('enum');
    expect(byName.stage.label).toBe('Stage');
    expect(byName.amount.kind).toBe('number');
    expect(byName.expectedCloseDate.kind).toBe('date');
  });
  it('localizes field labels', () => {
    expect(fieldLabel('stage', 'zh-Hans')).toBe('阶段');
    expect(fieldLabel('stage', 'en-US')).toBe('Stage');
  });
});
