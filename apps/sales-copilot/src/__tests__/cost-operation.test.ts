import { describe, expect, it } from 'vitest';
import { operationTypeFor, deriveTurnOperations } from '@/lib/cost-operation';

describe('operationTypeFor', () => {
  it('maps draftActivity to create.activity.<type> from args.type', () => {
    expect(operationTypeFor('draftActivity', { type: 'visit' })).toBe('create.activity.visit');
    expect(operationTypeFor('draftActivity', { type: 'Call' })).toBe('create.activity.call');
    expect(operationTypeFor('draftActivity', {})).toBe('create.activity');
  });

  it('maps update / query / knowledge / plan functions to stable types', () => {
    expect(operationTypeFor('updateOpportunity')).toBe('update.opportunity');
    expect(operationTypeFor('proposeChanges')).toBe('update.propose');
    expect(operationTypeFor('queryAccounts')).toBe('query.account');
    expect(operationTypeFor('queryCopilotStudio')).toBe('knowledge.product');
    expect(operationTypeFor('externalKnowledgeQuery')).toBe('knowledge.external');
    expect(operationTypeFor('suggestPlan')).toBe('plan.suggest');
    expect(operationTypeFor('summarizeEntities')).toBe('summarize.entities');
  });

  it('falls back to other.<fn> for unknown and conversation.general for empty', () => {
    expect(operationTypeFor('somethingNew')).toBe('other.somethingNew');
    expect(operationTypeFor('')).toBe('conversation.general');
  });
});

describe('deriveTurnOperations', () => {
  it('returns a single conversation.general op for a null / functionless plan', () => {
    expect(deriveTurnOperations(null)).toEqual([{ operationType: 'conversation.general', operationIndex: 0 }]);
    expect(deriveTurnOperations({ function: null })).toEqual([
      { operationType: 'conversation.general', operationIndex: 0 },
    ]);
  });

  it('single intent → one sole operation at index 0', () => {
    expect(deriveTurnOperations({ function: 'draftActivity', arguments: { type: 'visit' } })).toEqual([
      { operationType: 'create.activity.visit', operationIndex: 0 },
    ]);
  });

  it('multi-intent → head + additionalActions, indexed in order', () => {
    expect(
      deriveTurnOperations({
        function: 'draftActivity',
        arguments: { type: 'visit' },
        additionalActions: [{ function: 'updateOpportunity', arguments: {} }],
      }),
    ).toEqual([
      { operationType: 'create.activity.visit', operationIndex: 0 },
      { operationType: 'update.opportunity', operationIndex: 1 },
    ]);
  });

  it('folds the internal analyzeResults step into its parent query (not a separate op)', () => {
    expect(
      deriveTurnOperations({
        function: 'queryAccounts',
        arguments: {},
        additionalActions: [{ function: 'analyzeResults', arguments: {} }],
      }),
    ).toEqual([{ operationType: 'query.account', operationIndex: 0 }]);
  });
});
