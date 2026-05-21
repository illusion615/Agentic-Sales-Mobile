/**
 * Tests for the Router → Orchestrator → Skills architecture
 */
import { describe, it, expect } from 'vitest';
import { resolveRefs, isDagPlan, DagPlanSchema, SingleIntentSchema } from '@/lib/dag-schema';
import { selectSkills, formatSkillsForPrompt } from '@/lib/skills-selector';
import { getSubPromptKey } from '@/lib/frame-shadow';
import type { FrameResult } from '@/lib/frame-shadow';

function makeFrame(object: string, task: string, extras?: Partial<FrameResult>): FrameResult {
  return {
    salesObject: object as FrameResult['salesObject'],
    cognitiveTask: task as FrameResult['cognitiveTask'],
    temporal: 'none',
    reasoning: 'test',
    confidence: 90,
    ...extras,
  };
}

// ======================== Skills Selector ========================

describe('skills-selector', () => {
  it('filters to Activity skills for Activity frame', () => {
    const frame = makeFrame('Activity', 'Log');
    const skills = selectSkills(frame);
    const names = skills.map(s => s.name);

    expect(names).toContain('draftActivity');
    expect(names).toContain('updateActivity');
    expect(names).toContain('batchDraft');
    expect(names).not.toContain('draftAccount');
    expect(names).not.toContain('draftOpportunity');
  });

  it('filters to Account skills for Account frame', () => {
    const frame = makeFrame('Account', 'Find');
    const skills = selectSkills(frame);
    const names = skills.map(s => s.name);

    expect(names).toContain('searchAccounts');
    expect(names).toContain('getAccountDetails');
    expect(names).not.toContain('draftActivity');
  });

  it('includes all objects for Mixed frame', () => {
    const frame = makeFrame('Mixed', 'Log', {
      explicitNames: [
        { kind: 'opportunity', text: 'deal' },
        { kind: 'account', text: 'Acme' },
      ],
    });
    const skills = selectSkills(frame);
    const names = skills.map(s => s.name);

    expect(names).toContain('draftOpportunity');
    expect(names).toContain('draftAccount');
    expect(names).toContain('batchDraft');
  });

  it('includes Product skills for Product frame', () => {
    const frame = makeFrame('Product', 'Knowledge');
    const skills = selectSkills(frame);
    const names = skills.map(s => s.name);

    expect(names).toContain('queryCopilotStudio');
    expect(names).not.toContain('draftActivity');
  });

  it('returns fewer skills than total registry', () => {
    const frame = makeFrame('Contact', 'Log');
    const skills = selectSkills(frame);
    expect(skills.length).toBeLessThan(15);
    expect(skills.length).toBeGreaterThan(0);
  });

  it('formatSkillsForPrompt generates readable text', () => {
    const frame = makeFrame('None', 'Chat');
    const skills = selectSkills(frame);
    const text = formatSkillsForPrompt(skills, 'en');
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('[');
    expect(text).toContain('Parameters:');
  });

  it('single-object frame has fewer skills than Mixed frame', () => {
    const singleFrame = makeFrame('Contact', 'Log');
    const mixedFrame = makeFrame('Mixed', 'Log', {
      explicitNames: [
        { kind: 'account', text: 'a' },
        { kind: 'contact', text: 'b' },
        { kind: 'opportunity', text: 'c' },
      ],
    });
    expect(selectSkills(singleFrame).length).toBeLessThan(selectSkills(mixedFrame).length);
  });
});

// ======================== Frame Shadow Dispatch ========================

describe('frame-shadow dispatch', () => {
  it('getSubPromptKey returns correct format', () => {
    expect(getSubPromptKey(makeFrame('Activity', 'Log'))).toBe('Activity_Log');
    expect(getSubPromptKey(makeFrame('Mixed', 'Log'))).toBe('Mixed_Log');
    expect(getSubPromptKey(makeFrame('None', 'Chat'))).toBe('None_Chat');
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
    expect(DagPlanSchema.safeParse({ steps: [] }).success).toBe(false); // min 1 step
    expect(DagPlanSchema.safeParse({ notSteps: [] }).success).toBe(false);
  });
});
