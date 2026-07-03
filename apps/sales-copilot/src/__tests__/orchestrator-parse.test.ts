import { describe, it, expect, vi } from 'vitest';

// Mock the Power Automate service so importing orchestrator.ts (which pulls it in)
// doesn't try to load the real Power Apps runtime in the test environment.
vi.mock('@/services/power-automate-service', () => ({
  invokeFlowForLLM: vi.fn(),
}));

import { parseOrchestratorOutput } from '@/lib/orchestrator';
import type { DagPlan } from '@/lib/dag-schema';

type Skeleton = Parameters<typeof parseOrchestratorOutput>[1];
const oneStepSkeleton = [
  { seq: 1, outputRef: '$intent_0', suggestedFunction: 'updateActivity' },
] as unknown as Skeleton;

/**
 * Regression (browser-caught 2026-07-03): a composite plan (query → proposeChanges)
 * has MORE steps than the 1-intent skeleton, and the model emits dependsOn as a
 * string ("$intent_0"). The string→array coercion used to be gated behind
 * steps.length === skeleton.length, so composite plans failed to parse ("响应解析失败").
 */
describe('parseOrchestratorOutput — composite plans (steps > skeleton)', () => {
  it('parses a query→proposeChanges plan and coerces dependsOn string→array', () => {
    const raw = JSON.stringify({
      steps: [
        { seq: 1, function: 'queryActivities', arguments: { accountName: 'Royal London Hospital' } },
        { seq: 2, dependsOn: '$intent_0', function: 'proposeChanges', arguments: { goal: 'merge dups' } },
      ],
    });
    const plan = parseOrchestratorOutput(raw, oneStepSkeleton) as DagPlan | null;
    expect(plan).not.toBeNull();
    expect(plan!.steps).toHaveLength(2);
    expect(plan!.steps[1].function).toBe('proposeChanges');
    expect(plan!.steps[1].dependsOn).toEqual(['$intent_0']);
  });

  it('coerces arguments JSON-string→object on extra steps too', () => {
    const raw = JSON.stringify({
      steps: [
        { seq: 1, function: 'queryActivities', arguments: {} },
        { seq: 2, function: 'proposeChanges', arguments: '{"goal":"x"}' },
      ],
    });
    const plan = parseOrchestratorOutput(raw, oneStepSkeleton) as DagPlan | null;
    expect(plan).not.toBeNull();
    expect(plan!.steps[1].arguments).toEqual({ goal: 'x' });
  });

  it('still recovers skeleton fields on a 1:1 plan', () => {
    const raw = JSON.stringify({ steps: [{ function: 'updateActivity', arguments: { activityId: 'a' } }] });
    const plan = parseOrchestratorOutput(raw, oneStepSkeleton) as DagPlan | null;
    expect(plan).not.toBeNull();
    expect(plan!.steps[0].seq).toBe(1);
    expect(plan!.steps[0].outputRef).toBe('$intent_0');
  });
});
