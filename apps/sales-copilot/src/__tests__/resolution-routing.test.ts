import { describe, it, expect } from 'vitest';
import { buildQueueFromIntent } from '@/lib/intent-queue';
import type { IntentResult } from '@/lib/copilot-agent';

/**
 * Regression: multi-intent resolution routing (boss log 2026-07-02).
 * The orchestrator binds each intent's entities correctly (step 1 = 南山, step 2 = 罗湖),
 * but buildQueueFromIntent used to POOL every intent's resolutions onto the head, so
 * step 1 tried to resolve step 2's account ("罗湖人民医院"). Resolutions carry an
 * intentIndex (0 = head, 1+ = additionalActions); each queue intent must receive ONLY
 * its own.
 */

describe('buildQueueFromIntent — per-intent resolution routing', () => {
  const intent = {
    function: 'draftActivity',
    arguments: { title: '南山人民医院设备科李主任拜访计划', accountName: '南山人民医院', contactName: '设备科李主任' },
    requiresMatching: true,
    resolutions: [
      { entityType: 'account', query: '南山人民医院', intentIndex: 0 },
      { entityType: 'contact', query: '设备科李主任', intentIndex: 0 },
      { entityType: 'account', query: '罗湖人民医院', intentIndex: 1 },
      { entityType: 'contact', query: '深圳麦克医疗器械公司老板', intentIndex: 1 },
    ],
    additionalActions: [
      { function: 'draftActivity', arguments: { title: '罗湖人民医院院内会议', accountName: '罗湖人民医院' } },
    ],
    multiIntentAnalysis: { hasMultipleIntents: true, summary: '2 intents' },
  } as unknown as IntentResult;

  it('gives the head intent ONLY its own resolutions', () => {
    const q = buildQueueFromIntent(intent);
    expect(q.intents[0].resolutions.map((r) => r.query)).toEqual(['南山人民医院', '设备科李主任']);
    // The head must NOT carry step 2's account — this was the reported bug.
    expect(q.intents[0].resolutions.some((r) => r.query === '罗湖人民医院')).toBe(false);
  });

  it('gives each additional intent ONLY its own resolutions', () => {
    const q = buildQueueFromIntent(intent);
    expect(q.intents[1].resolutions.map((r) => r.query)).toEqual(['罗湖人民医院', '深圳麦克医疗器械公司老板']);
    expect(q.intents[1].resolutions.some((r) => r.query === '南山人民医院')).toBe(false);
  });

  it('defaults resolutions without an intentIndex to the head', () => {
    const single = {
      function: 'updateOpportunity',
      arguments: { opportunityName: 'ACME' },
      requiresMatching: true,
      resolutions: [{ entityType: 'opportunity', query: 'ACME' }], // no intentIndex
    } as unknown as IntentResult;
    const q = buildQueueFromIntent(single);
    expect(q.intents[0].resolutions.map((r) => r.query)).toEqual(['ACME']);
  });
});
