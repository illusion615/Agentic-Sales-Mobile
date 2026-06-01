/**
 * Tests for the multi-intent Frame → Orchestrator → Skills architecture.
 *
 * Per boss discipline: these tests do NOT hardcode LLM-output fixtures and
 * do NOT validate semantic correctness of the prompt. Real intent splitting
 * is validated via shadow benchmark in production. Here we only exercise:
 *   - Skills selector filtering by intent salesObjects
 *   - DAG schema parsing & ref resolution
 *   - Frame parser robustness against malformed / object-wrapped relatesTo
 */
import { describe, it, expect } from 'vitest';
import { resolveRefs, isDagPlan, DagPlanSchema, SingleIntentSchema } from '@/lib/dag-schema';
import { selectSkillsForIntents, formatSkillsForPrompt } from '@/lib/skills-selector';
import { tryParseFrame, type IntentItem } from '@/lib/frame-shadow';

function makeIntent(
  salesObject: IntentItem['salesObject'],
  cognitiveTask: IntentItem['cognitiveTask'],
  extras: Partial<IntentItem> = {}
): IntentItem {
  return {
    salesObject,
    cognitiveTask,
    temporal: 'none',
    summary: '',
    relatesTo: [],
    ...extras,
  };
}

// ======================== Skills Selector ========================

describe('skills-selector', () => {
  it('filters to Activity skills for a single Activity intent', () => {
    const skills = selectSkillsForIntents([makeIntent('Activity', 'Log')]);
    const names = skills.map((s) => s.name);

    expect(names).toContain('draftActivity');
    expect(names).toContain('updateActivity');
    expect(names).toContain('fuzzyMatchActivity');
    expect(names).not.toContain('draftAccount');
    expect(names).not.toContain('draftOpportunity');
  });

  it('filters to Account skills for an Account-only intent list', () => {
    const skills = selectSkillsForIntents([makeIntent('Account', 'Find')]);
    const names = skills.map((s) => s.name);

    expect(names).toContain('queryAccounts');
    expect(names).toContain('updateAccount');
    expect(names).not.toContain('draftActivity');
  });

  it('takes union across multi-intent lists', () => {
    const skills = selectSkillsForIntents([
      makeIntent('Opportunity', 'Log'),
      makeIntent('Activity', 'Plan'),
      makeIntent('Activity', 'Plan'),
    ]);
    const names = skills.map((s) => s.name);

    expect(names).toContain('draftOpportunity');
    expect(names).toContain('draftActivity');
    expect(names).toContain('fuzzyMatchActivity');
  });

  it('includes Product skills for a Product Knowledge intent', () => {
    const skills = selectSkillsForIntents([makeIntent('Product', 'Knowledge')]);
    const names = skills.map((s) => s.name);

    expect(names).toContain('queryCopilotStudio');
    expect(names).not.toContain('draftActivity');
  });

  it('a multi-object intent set produces more skills than a single-object set', () => {
    const single = selectSkillsForIntents([makeIntent('Contact', 'Log')]);
    const multi = selectSkillsForIntents([
      makeIntent('Account', 'Log'),
      makeIntent('Contact', 'Log'),
      makeIntent('Opportunity', 'Log'),
    ]);
    expect(multi.length).toBeGreaterThan(single.length);
  });

  it('formatSkillsForPrompt produces readable text', () => {
    const skills = selectSkillsForIntents([makeIntent('None', 'Chat')]);
    const text = formatSkillsForPrompt(skills, 'en');
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('[');
    expect(text).toContain('Parameters:');
  });
});

// ======================== Frame parser robustness ========================

describe('frame-shadow parser', () => {
  it('parses a clean valid response', () => {
    const raw = JSON.stringify({
      intents: [
        { salesObject: 'Activity', cognitiveTask: 'Log', temporal: 'past', summary: 'visit', relatesTo: [] },
      ],
      explicitNames: [],
      reasoning: 'one intent',
      confidence: 90,
    });
    const result = tryParseFrame(raw);
    expect(result).not.toBeNull();
    expect(result!.intents).toHaveLength(1);
    expect(result!.intents[0].salesObject).toBe('Activity');
  });

  it('coerces relatesTo with object-wrapped indices [{item:1}]', () => {
    const raw = JSON.stringify({
      intents: [
        { salesObject: 'Opportunity', cognitiveTask: 'Log', summary: 'deal', relatesTo: [] },
        { salesObject: 'Activity', cognitiveTask: 'Plan', summary: 'demo', relatesTo: [{ item: 0 }] },
      ],
      explicitNames: [],
      reasoning: 'r',
      confidence: 80,
    });
    const result = tryParseFrame(raw);
    expect(result).not.toBeNull();
    expect(result!.intents[1].relatesTo).toEqual([0]);
  });

  it('coerces relatesTo with {index:N}, {ref:N} object wrappers', () => {
    const raw = JSON.stringify({
      intents: [
        { salesObject: 'Account', cognitiveTask: 'Log', summary: 'a', relatesTo: [] },
        { salesObject: 'Activity', cognitiveTask: 'Log', summary: 'b', relatesTo: [{ index: 0 }, { ref: 0 }] },
      ],
      explicitNames: [],
      reasoning: 'r',
      confidence: 80,
    });
    const result = tryParseFrame(raw);
    expect(result).not.toBeNull();
    expect(result!.intents[1].relatesTo).toEqual([0, 0]);
  });

  it('coerces relatesTo with numeric strings', () => {
    const raw = JSON.stringify({
      intents: [
        { salesObject: 'Activity', cognitiveTask: 'Log', summary: 'a', relatesTo: [] },
        { salesObject: 'Activity', cognitiveTask: 'Plan', summary: 'b', relatesTo: ['0'] },
      ],
      explicitNames: [],
      reasoning: 'r',
      confidence: 80,
    });
    const result = tryParseFrame(raw);
    expect(result).not.toBeNull();
    expect(result!.intents[1].relatesTo).toEqual([0]);
  });

  it('drops relatesTo indices that point outside the array', () => {
    const raw = JSON.stringify({
      intents: [
        { salesObject: 'Activity', cognitiveTask: 'Log', summary: 'a', relatesTo: [99, -1, 0] },
      ],
      explicitNames: [],
      reasoning: 'r',
      confidence: 80,
    });
    const result = tryParseFrame(raw);
    expect(result).not.toBeNull();
    expect(result!.intents[0].relatesTo).toEqual([0]);
  });

  it('coerces confidence from string', () => {
    const raw = JSON.stringify({
      intents: [{ salesObject: 'None', cognitiveTask: 'Chat', summary: '', relatesTo: [] }],
      explicitNames: [],
      reasoning: 'r',
      confidence: '75',
    });
    const result = tryParseFrame(raw);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(75);
  });

  it('extracts JSON from markdown-fenced response', () => {
    const raw = '```json\n' + JSON.stringify({
      intents: [{ salesObject: 'None', cognitiveTask: 'Chat', summary: 'hi', relatesTo: [] }],
      explicitNames: [],
      reasoning: 'r',
      confidence: 90,
    }) + '\n```';
    const result = tryParseFrame(raw);
    expect(result).not.toBeNull();
    expect(result!.intents[0].cognitiveTask).toBe('Chat');
  });

  it('returns null on malformed JSON', () => {
    expect(tryParseFrame('not json at all')).toBeNull();
  });

  it('returns null when intents array is missing', () => {
    const raw = JSON.stringify({ reasoning: 'no intents', confidence: 50 });
    expect(tryParseFrame(raw)).toBeNull();
  });

  it('returns null when intents array is empty', () => {
    const raw = JSON.stringify({ intents: [], reasoning: 'r', confidence: 80 });
    expect(tryParseFrame(raw)).toBeNull();
  });

  it('rejects unknown salesObject values', () => {
    const raw = JSON.stringify({
      intents: [{ salesObject: 'Mixed', cognitiveTask: 'Log', summary: '', relatesTo: [] }],
      explicitNames: [],
      reasoning: 'r',
      confidence: 80,
    });
    expect(tryParseFrame(raw)).toBeNull();
  });
});

// ======================== DAG Schema ========================

describe('dag-schema', () => {
  it('parses a valid single intent', () => {
    const result = SingleIntentSchema.safeParse({
      function: 'draftActivity',
      arguments: { title: 'test', type: 'visit' },
    });
    expect(result.success).toBe(true);
  });

  it('parses a valid DAG plan', () => {
    const plan = {
      steps: [
        { seq: 1, outputRef: '$opp', function: 'draftOpportunity', arguments: { name: 'Deal' } },
        { seq: 2, dependsOn: ['$opp'], function: 'draftActivity', arguments: { opportunityId: '$opp.id' } },
      ],
    };
    expect(DagPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('isDagPlan distinguishes plan from single intent', () => {
    expect(isDagPlan({ steps: [{ seq: 1, function: 'f', arguments: {} }] })).toBe(true);
    expect(isDagPlan({ function: 'f', arguments: {} })).toBe(false);
  });

  it('resolveRefs replaces $ref.field placeholders', () => {
    const resolved = resolveRefs(
      { opportunityId: '$opp.id', opportunityName: '$opp.name', title: 'Meeting' },
      { '$opp': { id: 'opp-123', name: 'Big Deal' } }
    );
    expect(resolved.opportunityId).toBe('opp-123');
    expect(resolved.opportunityName).toBe('Big Deal');
    expect(resolved.title).toBe('Meeting');
  });

  it('resolveRefs keeps unresolved refs as-is', () => {
    expect(resolveRefs({ id: '$missing.id' }, {}).id).toBe('$missing.id');
  });

  it('rejects invalid DAG plans', () => {
    expect(DagPlanSchema.safeParse({ steps: [] }).success).toBe(false);
    expect(DagPlanSchema.safeParse({ notSteps: [] }).success).toBe(false);
  });
});
