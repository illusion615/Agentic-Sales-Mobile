import { describe, it, expect } from 'vitest';
import { getFunctionSubject } from '@/lib/function-registry';
import { ensureRequiredSubjectResolution } from '@/lib/intent-queue';
import type { IntentQueue, QueueIntent } from '@/lib/intent-queue';

/**
 * Missing-subject gate (boss directive 2026-07-02): when an action tool is
 * invoked without its required subject id (e.g. "update the opportunity to 100k"
 * with no opportunity named), the runtime must NOT hard-fail in the handler. It
 * appends a REQUIRED resolution so the user can pick/search the record via the
 * existing match-selection card. When the subject is already known (args or
 * resolvedContext from the page / a prior intent), the gate is a silent no-op.
 */

function makeQueue(
  intent: Partial<QueueIntent>,
  resolvedContext: Record<string, string> = {},
): IntentQueue {
  const full: QueueIntent = {
    id: 'q-0-0',
    index: 0,
    function: 'updateOpportunity',
    arguments: {},
    resolutions: [],
    status: 'queued',
    ...intent,
  };
  return { id: 'q', intents: [full], cursor: 0, resolvedContext, createdAt: 0, done: false };
}

describe('getFunctionSubject', () => {
  it('returns the subject entity for the four update tools', () => {
    expect(getFunctionSubject('updateOpportunity')).toBe('opportunity');
    expect(getFunctionSubject('updateAccount')).toBe('account');
    expect(getFunctionSubject('updateContact')).toBe('contact');
    expect(getFunctionSubject('updateActivity')).toBe('activity');
  });

  it('returns undefined for tools that do not mutate one existing record', () => {
    expect(getFunctionSubject('queryOpportunities')).toBeUndefined();
    expect(getFunctionSubject('draftOpportunity')).toBeUndefined();
    expect(getFunctionSubject('unknownFunction')).toBeUndefined();
  });
});

describe('ensureRequiredSubjectResolution (missing-subject gate)', () => {
  it('appends a required, empty-query resolution when no subject/name is given', () => {
    const q = makeQueue({ function: 'updateOpportunity', arguments: { amount: 100000 } });
    const out = ensureRequiredSubjectResolution(q, q.intents[0]);
    expect(out.intents[0].resolutions).toHaveLength(1);
    expect(out.intents[0].resolutions[0]).toMatchObject({
      entityType: 'opportunity',
      query: '',
      required: true,
    });
  });

  it('seeds the fuzzy query from a provided name (no id)', () => {
    const q = makeQueue({
      function: 'updateOpportunity',
      arguments: { opportunityName: 'ACME expansion', amount: 100000 },
    });
    const out = ensureRequiredSubjectResolution(q, q.intents[0]);
    expect(out.intents[0].resolutions[0]).toMatchObject({
      entityType: 'opportunity',
      query: 'ACME expansion',
      required: true,
    });
  });

  it('is a silent no-op (fast path) when the subject id is already in args', () => {
    const q = makeQueue({
      function: 'updateOpportunity',
      arguments: { opportunityId: 'opp-1', amount: 100000 },
    });
    const out = ensureRequiredSubjectResolution(q, q.intents[0]);
    expect(out).toBe(q);
    expect(out.intents[0].resolutions).toHaveLength(0);
  });

  it('is a no-op when the subject id comes from resolvedContext (page / prior intent)', () => {
    const q = makeQueue(
      { function: 'updateOpportunity', arguments: { amount: 100000 } },
      { opportunityId: 'opp-9' },
    );
    const out = ensureRequiredSubjectResolution(q, q.intents[0]);
    expect(out.intents[0].resolutions).toHaveLength(0);
  });

  it('does not double-add when a subject resolution is already queued', () => {
    const q = makeQueue({
      function: 'updateOpportunity',
      arguments: {},
      resolutions: [{ entityType: 'opportunity', query: 'x' }],
    });
    const out = ensureRequiredSubjectResolution(q, q.intents[0]);
    expect(out.intents[0].resolutions).toHaveLength(1);
  });

  it('gates the other update tools by their declared subject', () => {
    const acc = makeQueue({ function: 'updateAccount', arguments: {} });
    expect(ensureRequiredSubjectResolution(acc, acc.intents[0]).intents[0].resolutions[0])
      .toMatchObject({ entityType: 'account', required: true });

    const con = makeQueue({ function: 'updateContact', arguments: {} });
    expect(ensureRequiredSubjectResolution(con, con.intents[0]).intents[0].resolutions[0])
      .toMatchObject({ entityType: 'contact', required: true });

    const act = makeQueue({ function: 'updateActivity', arguments: {} });
    expect(ensureRequiredSubjectResolution(act, act.intents[0]).intents[0].resolutions[0])
      .toMatchObject({ entityType: 'activity', required: true });
  });

  it('ignores functions without a subject contract', () => {
    const q = makeQueue({ function: 'queryOpportunities', arguments: {} });
    const out = ensureRequiredSubjectResolution(q, q.intents[0]);
    expect(out).toBe(q);
    expect(out.intents[0].resolutions).toHaveLength(0);
  });
});
