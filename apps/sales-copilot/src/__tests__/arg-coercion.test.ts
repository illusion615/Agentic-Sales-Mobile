/**
 * Argument coercion (input contract) — the executor coerces raw LLM tool-call
 * args against a schema DERIVED from each function's declared `parameters` before
 * dispatch, absorbing "LLM argument type drift" (arrays where strings are
 * declared, numeric strings for numbers, etc.) at one boundary.
 *
 * Regression for the 2026-07-01 crash: "opportunities in negotiation and proposal
 * stages" made the LLM send stage as an array → `stage.trim()` threw. Coercion +
 * the array-typed `stage` contract now normalize that cleanly.
 */
import { describe, it, expect } from 'vitest';
import { coerceArgs } from '@/lib/function-registry';

describe('coerceArgs (LLM argument type drift)', () => {
  it('collapses an array sent for a scalar string field to a string', () => {
    const out = coerceArgs('queryAccounts', { name: ['Acme', 'Beta'] });
    expect(out.name).toBe('Acme');
    expect(typeof out.name).toBe('string');
  });

  it('coerces a numeric string to a number for number fields', () => {
    const out = coerceArgs('queryAccounts', { limit: '5' });
    expect(out.limit).toBe(5);
  });

  it('normalizes a multi-value stage (array) to a string[]', () => {
    const out = coerceArgs('queryOpportunities', { stage: ['negotiation', 'proposal'] });
    expect(out.stage).toEqual(['negotiation', 'proposal']);
  });

  it('splits a comma-joined stage string into a string[]', () => {
    const out = coerceArgs('queryOpportunities', { stage: 'negotiation, proposal' });
    expect(out.stage).toEqual(['negotiation', 'proposal']);
  });

  it('coerces an array sent for a now-declared update field (no crash)', () => {
    expect(coerceArgs('updateOpportunity', { accountName: ['Acme Corp'] }).accountName).toBe('Acme Corp');
    expect(coerceArgs('updateActivity', { status: ['completed'] }).status).toBe('completed');
  });

  it('drops a scalar field that coerces to empty so handler defaults still apply', () => {
    const out = coerceArgs('queryAccounts', { name: '', region: [] });
    expect('name' in out).toBe(false);
    expect('region' in out).toBe(false);
  });

  it('drops an object sent for a string field instead of crashing downstream', () => {
    const out = coerceArgs('queryAccounts', { name: { nested: 1 } });
    expect('name' in out).toBe(false);
  });

  it('passes through undeclared keys and structured args untouched', () => {
    const attendees = [{ id: '1', fullname: 'X' }];
    const out = coerceArgs('draftActivity', { attendees, __attachmentIds: ['a1'] });
    expect(out.attendees).toBe(attendees);
    expect(out.__attachmentIds).toEqual(['a1']);
  });

  it('returns args unchanged for an unknown function', () => {
    const args = { anything: [1, 2, 3] };
    expect(coerceArgs('nonexistentFunction', args)).toBe(args);
  });

  it('never throws on hostile input (coerce-not-block)', () => {
    expect(() => coerceArgs('queryOpportunities', { stage: [{}, null, 5], minAmount: ['x'] })).not.toThrow();
  });
});
