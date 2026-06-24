import { describe, it, expect } from 'vitest';
import { normalizeStage } from '@/lib/functions/query-handlers';

/**
 * Regression for the Chinese/English stage-word bug (2026-06-12): the LLM emits
 * the opportunity stage in Chinese ("谈判") or English variants; the handler must
 * map them to the canonical lowercase enum so the filter doesn't return 0.
 */
describe('normalizeStage (stage alias mapping)', () => {
  it('maps Chinese stage words to canonical English enum', () => {
    expect(normalizeStage('谈判')).toBe('negotiation');
    expect(normalizeStage('商务谈判')).toBe('negotiation');
    expect(normalizeStage('提案')).toBe('proposal');
    expect(normalizeStage('赢单')).toBe('won');
    expect(normalizeStage('输单')).toBe('lost');
    expect(normalizeStage('潜在客户')).toBe('prospecting');
    expect(normalizeStage('资格审查')).toBe('qualification');
  });

  it('normalizes English case and variants', () => {
    expect(normalizeStage('Negotiation')).toBe('negotiation');
    expect(normalizeStage(' negotiating ')).toBe('negotiation');
    expect(normalizeStage('Closed Won')).toBe('won');
    expect(normalizeStage('PROPOSAL')).toBe('proposal');
  });

  it('passes through an already-canonical or unknown value lowercased', () => {
    expect(normalizeStage('negotiation')).toBe('negotiation');
    expect(normalizeStage('SomethingElse')).toBe('somethingelse');
  });
});
