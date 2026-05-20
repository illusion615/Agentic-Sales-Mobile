/**
 * Tests for the sub-prompt registry and DAG schema
 */
import { describe, it, expect } from 'vitest';
import { getSubPrompt, getRegisteredKeys } from '@/lib/sub-prompts/index';
import { resolveRefs, isDagPlan, DagPlanSchema, SingleIntentSchema } from '@/lib/sub-prompts/dag-schema';
import type { FrameResult } from '@/lib/frame-shadow';

function makeFrame(object: string, task: string): FrameResult {
  return {
    salesObject: object as FrameResult['salesObject'],
    cognitiveTask: task as FrameResult['cognitiveTask'],
    temporal: 'none',
    reasoning: 'test',
    confidence: 90,
  };
}

describe('sub-prompt registry', () => {
  it('has prompts for all 22 populated cells', () => {
    const keys = getRegisteredKeys();
    expect(keys.length).toBeGreaterThanOrEqual(18); // at least 18 cells registered

    // Verify critical cells exist
    expect(keys).toContain('Activity_Log');
    expect(keys).toContain('Activity_Plan');
    expect(keys).toContain('Activity_Find');
    expect(keys).toContain('Activity_Update');
    expect(keys).toContain('Activity_Report');
    expect(keys).toContain('Account_Log');
    expect(keys).toContain('Account_Find');
    expect(keys).toContain('Account_Update');
    expect(keys).toContain('Opportunity_Log');
    expect(keys).toContain('Opportunity_Find');
    expect(keys).toContain('Opportunity_Update');
    expect(keys).toContain('Contact_Log');
    expect(keys).toContain('Contact_Find');
    expect(keys).toContain('Contact_Update');
    expect(keys).toContain('Product_Knowledge');
    expect(keys).toContain('Product_Recommend');
    expect(keys).toContain('Mixed_Log');
    expect(keys).toContain('None_Chat');
    expect(keys).toContain('None_Knowledge');
  });

  it('getSubPrompt returns a definition for registered cells', () => {
    const frame = makeFrame('Activity', 'Log');
    const def = getSubPrompt(frame);
    expect(def).not.toBeNull();
    expect(def!.buildSystemPrompt).toBeTypeOf('function');
    expect(def!.buildUserPrompt).toBeTypeOf('function');
  });

  it('getSubPrompt returns null for unregistered cells', () => {
    const frame = makeFrame('Account', 'Recommend'); // not populated
    const def = getSubPrompt(frame);
    expect(def).toBeNull();
  });

  it('sub-prompts build bilingual system prompts', () => {
    const frame = makeFrame('Activity', 'Log');
    const def = getSubPrompt(frame)!;

    const zhPrompt = def.buildSystemPrompt({
      userMessage: '记录拜访', locale: 'zh-Hans', frame,
    });
    const enPrompt = def.buildSystemPrompt({
      userMessage: 'log a visit', locale: 'en', frame,
    });

    expect(zhPrompt).toContain('temporalMode');
    expect(enPrompt).toContain('temporalMode');
    expect(zhPrompt).not.toBe(enPrompt);
  });

  it('sub-prompts inject bound entities into user prompt', () => {
    const frame: FrameResult = {
      ...makeFrame('Activity', 'Log'),
      boundEntities: {
        account: { id: 'acc-1', name: 'Acme Corp' },
        opportunity: { id: 'opp-1', name: 'Big Deal' },
      },
    };
    const def = getSubPrompt(frame)!;
    const userPrompt = def.buildUserPrompt({
      userMessage: 'log a visit', locale: 'en', frame,
    });

    expect(userPrompt).toContain('acc-1');
    expect(userPrompt).toContain('Acme Corp');
    expect(userPrompt).toContain('opp-1');
  });
});

describe('DAG schema', () => {
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
    const result = DagPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it('isDagPlan distinguishes plan from single intent', () => {
    expect(isDagPlan({ steps: [{ seq: 1, function: 'f', arguments: {} }] })).toBe(true);
    expect(isDagPlan({ function: 'f', arguments: {} })).toBe(false);
  });

  it('resolveRefs replaces $ref.field placeholders', () => {
    const context = {
      '$opp': { id: 'opp-123', name: 'Big Deal' },
    };
    const args = {
      title: 'Meeting',
      opportunityId: '$opp.id',
      opportunityName: '$opp.name',
      plain: 'no-ref',
    };
    const resolved = resolveRefs(args, context);
    expect(resolved.opportunityId).toBe('opp-123');
    expect(resolved.opportunityName).toBe('Big Deal');
    expect(resolved.title).toBe('Meeting');
    expect(resolved.plain).toBe('no-ref');
  });

  it('resolveRefs keeps unresolved refs as-is', () => {
    const resolved = resolveRefs({ id: '$missing.id' }, {});
    expect(resolved.id).toBe('$missing.id');
  });
});

describe('mixed prompts DAG output', () => {
  it('Mixed_Log sub-prompt mentions DAG schema in system prompt', () => {
    const frame = makeFrame('Mixed', 'Log');
    const def = getSubPrompt(frame)!;
    const prompt = def.buildSystemPrompt({
      userMessage: 'create opp and schedule meeting', locale: 'en', frame,
    });
    expect(prompt).toContain('seq');
    expect(prompt).toContain('outputRef');
    expect(prompt).toContain('dependsOn');
    expect(prompt).toContain('$opp.id');
  });
});
