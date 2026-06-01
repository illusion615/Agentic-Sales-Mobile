import { describe, it, expect } from 'vitest';
import { frameToIntent, type TranslatedIntent } from '@/lib/frame-to-intent';
import type { PipelineResult } from '@/lib/shadow-agent';

function makeShadow(plan: PipelineResult['plan'], reasoning = ''): PipelineResult {
  // Cast via unknown — frame-to-intent only reads `reasoning` and `confidence`
  // from the frame payload, so a partial mock is sufficient for these tests.
  const frame = {
    intents: [{ salesObject: 'Activity' }],
    explicitNames: [],
    reasoning,
    confidence: 80,
  } as unknown as PipelineResult['frame'];
  return {
    frame,
    frameLatencyMs: 0,
    skillsCount: 0,
    plan,
    planLatencyMs: 0,
    totalLatencyMs: 0,
  };
}

describe('frameToIntent', () => {
  it('returns null when plan is missing', () => {
    expect(frameToIntent(makeShadow(null))).toBeNull();
  });

  it('translates a SingleIntent into primary fn + arguments without additionalActions', () => {
    const shadow = makeShadow({
      function: 'draftActivity',
      arguments: { title: 'Follow up', accountName: 'Acme' },
    });
    const out = frameToIntent(shadow) as TranslatedIntent;
    expect(out).not.toBeNull();
    expect(out.function).toBe('draftActivity');
    expect(out.arguments.title).toBe('Follow up');
    expect(out.additionalActions).toBeUndefined();
    expect(out.multiIntentAnalysis).toBeUndefined();
  });

  it('emits resolutions[] for draft entity-name fields without ids', () => {
    const shadow = makeShadow({
      function: 'draftActivity',
      arguments: {
        title: 'Demo',
        accountName: 'Acme',
        contactName: 'Lisa',
        opportunityName: 'OR Refresh',
      },
    });
    const out = frameToIntent(shadow)!;
    expect(out.requiresMatching).toBe(true);
    const kinds = (out.resolutions || []).map((r) => r.entityType);
    // Expect account first (so contact/opp can scope by it), then contact, opp, then activity dup-check.
    expect(kinds).toEqual(['account', 'contact', 'opportunity', 'activity']);
    const contact = out.resolutions!.find((r) => r.entityType === 'contact');
    expect(contact?.scopeBy).toBe('account');
    const opp = out.resolutions!.find((r) => r.entityType === 'opportunity');
    expect(opp?.scopeBy).toBe('account');
  });

  it('skips resolution when an id is already provided alongside the name', () => {
    const shadow = makeShadow({
      function: 'draftActivity',
      arguments: {
        title: 'Demo',
        accountName: 'Acme',
        accountId: 'acc-123',
      },
    });
    const out = frameToIntent(shadow)!;
    const kinds = (out.resolutions || []).map((r) => r.entityType);
    expect(kinds).not.toContain('account');
  });

  it('translates a multi-step DAG into primary + additionalActions and SETS hasMultipleIntents=true', () => {
    const shadow = makeShadow({
      steps: [
        {
          seq: 1,
          function: 'draftOpportunity',
          arguments: { name: 'OR Refresh', accountName: 'London Hospital' },
        },
        {
          seq: 2,
          function: 'draftActivity',
          arguments: { title: 'Internal prep meeting' },
        },
        {
          seq: 3,
          function: 'draftActivity',
          arguments: { title: 'Customer demo' },
        },
      ],
    }, 'Three intents detected');
    const out = frameToIntent(shadow)!;
    expect(out.function).toBe('draftOpportunity');
    expect(out.additionalActions).toHaveLength(2);
    expect(out.additionalActions![0].function).toBe('draftActivity');
    // Critical regression guard: dispatcher in copilot-agent.ts drops additionalActions
    // unless this flag is true. See traps.md.
    expect(out.multiIntentAnalysis?.hasMultipleIntents).toBe(true);
    expect(out.multiIntentAnalysis?.summary).toBe('Three intents detected');
  });

  it('orders DAG steps by seq before slotting primary/additionalActions', () => {
    const shadow = makeShadow({
      steps: [
        { seq: 3, function: 'draftActivity', arguments: { title: 'Last' } },
        { seq: 1, function: 'draftOpportunity', arguments: { name: 'First' } },
        { seq: 2, function: 'draftActivity', arguments: { title: 'Middle' } },
      ],
    });
    const out = frameToIntent(shadow)!;
    expect(out.function).toBe('draftOpportunity');
    expect(out.arguments.name).toBe('First');
    expect(out.additionalActions!.map((a) => a.arguments.title)).toEqual([
      'Middle',
      'Last',
    ]);
  });

  it('returns null for an empty DAG', () => {
    const shadow = makeShadow({ steps: [] } as unknown as PipelineResult['plan']);
    expect(frameToIntent(shadow)).toBeNull();
  });

  it('falls back summary text when frame.reasoning is empty', () => {
    const shadow = makeShadow({
      steps: [
        { seq: 1, function: 'draftOpportunity', arguments: {} },
        { seq: 2, function: 'draftActivity', arguments: {} },
      ],
    }, '');
    const out = frameToIntent(shadow)!;
    expect(out.multiIntentAnalysis?.summary).toMatch(/intents from frame/);
  });
});
