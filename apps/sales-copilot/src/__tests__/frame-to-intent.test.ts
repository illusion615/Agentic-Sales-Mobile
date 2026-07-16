import { describe, it, expect } from 'vitest';
import { frameToIntent, type TranslatedIntent } from '@/lib/frame-to-intent';
import type { PipelineResult } from '@/lib/orchestrator';

function makePipeline(
  plan: PipelineResult['plan'],
  reasoning = '',
  frameIntents: Array<Record<string, unknown>> = [{ salesObject: 'Activity' }],
): PipelineResult {
  // Cast via unknown — frame-to-intent only reads `reasoning` and `confidence`
  // from the frame payload, so a partial mock is sufficient for these tests.
  const frame = {
    intents: frameIntents,
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
    expect(frameToIntent(makePipeline(null))).toBeNull();
  });

  it('translates a SingleIntent into primary fn + arguments without additionalActions', () => {
    const pipeline = makePipeline({
      function: 'draftActivity',
      arguments: { title: 'Follow up', accountName: 'Acme' },
    });
    const out = frameToIntent(pipeline) as TranslatedIntent;
    expect(out).not.toBeNull();
    expect(out.function).toBe('draftActivity');
    expect(out.arguments.title).toBe('Follow up');
    expect(out.additionalActions).toBeUndefined();
    expect(out.multiIntentAnalysis).toBeUndefined();
  });

  it('injects deterministic completed/planned modes from Frame temporal semantics', () => {
    const past = frameToIntent(makePipeline({
      function: 'draftActivity',
      arguments: { title: 'Completed visit', temporalMode: 'planned' },
    }, '', [{ salesObject: 'Activity', temporal: 'past' }]))!;
    expect(past.arguments.temporalMode).toBe('completed');

    const future = frameToIntent(makePipeline({
      function: 'draftActivity',
      arguments: { title: 'Future visit', temporalMode: 'completed' },
    }, '', [{ salesObject: 'Activity', temporal: 'future' }]))!;
    expect(future.arguments.temporalMode).toBe('planned');
  });

  it('injects unspecified when Frame has no tense so the draft handler can use the date fallback', () => {
    const out = frameToIntent(makePipeline({
      function: 'draftActivity',
      arguments: { title: 'Ambiguous visit', scheduledDate: '2026-07-14' },
    }, '', [{ salesObject: 'Activity', temporal: 'none' }]))!;

    expect(out.arguments.temporalMode).toBe('unspecified');
  });

  it('emits resolutions[] for draft entity-name fields without ids', () => {
    const pipeline = makePipeline({
      function: 'draftActivity',
      arguments: {
        title: 'Demo',
        accountName: 'Acme',
        contactName: 'Lisa',
        opportunityName: 'OR Refresh',
      },
    });
    const out = frameToIntent(pipeline)!;
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
    const pipeline = makePipeline({
      function: 'draftActivity',
      arguments: {
        title: 'Demo',
        accountName: 'Acme',
        accountId: 'acc-123',
      },
    });
    const out = frameToIntent(pipeline)!;
    const kinds = (out.resolutions || []).map((r) => r.entityType);
    expect(kinds).not.toContain('account');
  });

  it('translates a multi-step DAG into primary + additionalActions and SETS hasMultipleIntents=true', () => {
    const pipeline = makePipeline({
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
    const out = frameToIntent(pipeline)!;
    expect(out.function).toBe('draftOpportunity');
    expect(out.additionalActions).toHaveLength(2);
    expect(out.additionalActions![0].function).toBe('draftActivity');
    // Critical regression guard: dispatcher in copilot-agent.ts drops additionalActions
    // unless this flag is true. See traps.md.
    expect(out.multiIntentAnalysis?.hasMultipleIntents).toBe(true);
    expect(out.multiIntentAnalysis?.summary).toBe('Three intents detected');
  });

  it('injects each DAG activity mode from its matching Frame intent', () => {
    const pipeline = makePipeline({
      steps: [
        { seq: 1, function: 'draftActivity', arguments: { title: 'Past visit' } },
        { seq: 2, function: 'draftActivity', arguments: { title: 'Future call' } },
      ],
    }, '', [
      { salesObject: 'Activity', temporal: 'past' },
      { salesObject: 'Activity', temporal: 'future' },
    ]);

    const out = frameToIntent(pipeline)!;
    expect(out.arguments.temporalMode).toBe('completed');
    expect(out.additionalActions?.[0].arguments.temporalMode).toBe('planned');
  });

  it('orders DAG steps by seq before slotting primary/additionalActions', () => {
    const pipeline = makePipeline({
      steps: [
        { seq: 3, function: 'draftActivity', arguments: { title: 'Last' } },
        { seq: 1, function: 'draftOpportunity', arguments: { name: 'First' } },
        { seq: 2, function: 'draftActivity', arguments: { title: 'Middle' } },
      ],
    });
    const out = frameToIntent(pipeline)!;
    expect(out.function).toBe('draftOpportunity');
    expect(out.arguments.name).toBe('First');
    expect(out.additionalActions!.map((a) => a.arguments.title)).toEqual([
      'Middle',
      'Last',
    ]);
  });

  it('returns null for an empty DAG', () => {
    const pipeline = makePipeline({ steps: [] } as unknown as PipelineResult['plan']);
    expect(frameToIntent(pipeline)).toBeNull();
  });

  it('falls back summary text when frame.reasoning is empty', () => {
    const pipeline = makePipeline({
      steps: [
        { seq: 1, function: 'draftOpportunity', arguments: {} },
        { seq: 2, function: 'draftActivity', arguments: {} },
      ],
    }, '');
    const out = frameToIntent(pipeline)!;
    expect(out.multiIntentAnalysis?.summary).toMatch(/intents from frame/);
  });

  it('blanks $intent_N.* ref placeholders so resolvedContext fills them at runtime', () => {
    // DAG: step 1 creates the opportunity; step 2 logs an activity that relates
    // to it via "$intent_1.*" placeholders. Those placeholders must NOT survive
    // into the intent args (they leak into the card as "$intent_1.name" and, being
    // non-empty, block buildEffectiveArgs from filling the real created values).
    const pipeline = makePipeline({
      steps: [
        {
          seq: 1,
          function: 'draftOpportunity',
          arguments: { name: 'New OR Equipment', accountName: 'Nanshan Hospital' },
        },
        {
          seq: 2,
          function: 'draftActivity',
          arguments: {
            title: 'Internal prep meeting',
            accountName: 'Nanshan Hospital',
            opportunityId: '$intent_1.id',
            opportunityName: '$intent_1.name',
          },
        },
      ],
    });
    const out = frameToIntent(pipeline)!;
    const activity = out.additionalActions![0].arguments;
    // Placeholders normalized to '' → buildEffectiveArgs will fill from resolvedContext.
    expect(activity.opportunityId).toBe('');
    expect(activity.opportunityName).toBe('');
    // Literal fields are untouched.
    expect(activity.title).toBe('Internal prep meeting');
    expect(activity.accountName).toBe('Nanshan Hospital');
    // A blanked opportunityName must NOT spawn a fuzzy-match resolution.
    const oppRes = (out.resolutions || []).find(
      (r) => r.entityType === 'opportunity' && r.intentIndex === 1,
    );
    expect(oppRes).toBeUndefined();
  });
});

describe('frameToIntent — query→think routing (analyzeResults)', () => {
  function makeReadPipeline(
    fn: string,
    frameIntent: { salesObject: string; cognitiveTask: string },
  ): PipelineResult {
    const frame = {
      intents: [frameIntent],
      explicitNames: [],
      reasoning: '',
      confidence: 80,
    } as unknown as PipelineResult['frame'];
    return {
      frame,
      frameLatencyMs: 0,
      skillsCount: 0,
      plan: { function: fn, arguments: {} },
      planLatencyMs: 0,
      totalLatencyMs: 0,
    };
  }

  it('appends a grounded analyzeResults think step for a single Analyze query', () => {
    const out = frameToIntent(makeReadPipeline('queryAccounts', { salesObject: 'Account', cognitiveTask: 'Analyze' }))!;
    expect(out.function).toBe('queryAccounts');
    expect(out.additionalActions?.map((a) => a.function)).toEqual(['analyzeResults']);
    // Required or the dispatcher drops the extra (see traps).
    expect(out.multiIntentAnalysis?.hasMultipleIntents).toBe(true);
  });

  it('appends analyzeResults for a single Report query', () => {
    const out = frameToIntent(makeReadPipeline('queryOpportunities', { salesObject: 'Opportunity', cognitiveTask: 'Report' }))!;
    expect(out.additionalActions?.map((a) => a.function)).toEqual(['analyzeResults']);
  });

  it('does NOT append analyzeResults for a plain Find query', () => {
    const out = frameToIntent(makeReadPipeline('queryActivities', { salesObject: 'Activity', cognitiveTask: 'Find' }))!;
    expect(out.additionalActions).toBeUndefined();
  });

  it('leaves Activity Analyze (brainstorm) alone so the suggestPlan path is preserved', () => {
    const out = frameToIntent(makeReadPipeline('queryActivities', { salesObject: 'Activity', cognitiveTask: 'Analyze' }))!;
    expect(out.additionalActions).toBeUndefined();
  });

  it('does not append analyzeResults when the read did not resolve to a query (e.g. suggestPlan)', () => {
    const out = frameToIntent(makeReadPipeline('suggestPlan', { salesObject: 'Activity', cognitiveTask: 'Analyze' }))!;
    expect(out.additionalActions).toBeUndefined();
  });
});
