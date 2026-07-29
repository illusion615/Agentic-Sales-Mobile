import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_OPERATION_TYPE,
  buildTurnCostRows,
  deriveTurnOperations,
  type OperationClassifier,
} from '../ai-cost';

const classify: OperationClassifier = (fn, args) => {
  if (fn === 'draftActivity') {
    const t = typeof args.type === 'string' ? args.type : '';
    return t ? `create.activity.${t}` : 'create.activity';
  }
  return `other.${fn}`;
};

describe('deriveTurnOperations', () => {
  it('falls back to a conversational operation when there is no plan', () => {
    expect(deriveTurnOperations(null, classify)).toEqual([
      { operationType: CONVERSATION_OPERATION_TYPE, operationIndex: 0 },
    ]);
  });

  it('indexes the head intent then each additional action', () => {
    const ops = deriveTurnOperations(
      {
        function: 'draftActivity',
        arguments: { type: 'visit' },
        additionalActions: [{ function: 'updateOpportunity' }],
      },
      classify,
    );

    expect(ops).toEqual([
      { operationType: 'create.activity.visit', operationIndex: 0 },
      { operationType: 'other.updateOpportunity', operationIndex: 1 },
    ]);
  });

  it('folds internal continuation steps into their parent operation', () => {
    const ops = deriveTurnOperations(
      { function: 'queryAccounts', additionalActions: [{ function: 'analyzeResults' }] },
      classify,
      { internalStepFunctions: ['analyzeResults'] },
    );

    // A single read turn must stay ONE operation, or its per-operation cost
    // sample would be halved.
    expect(ops).toHaveLength(1);
    expect(ops[0].operationType).toBe('other.queryAccounts');
  });

  it('treats a plan made only of internal steps as conversational', () => {
    const ops = deriveTurnOperations({ function: 'analyzeResults' }, classify, {
      internalStepFunctions: ['analyzeResults'],
    });
    expect(ops).toEqual([{ operationType: CONVERSATION_OPERATION_TYPE, operationIndex: 0 }]);
  });
});

describe('buildTurnCostRows', () => {
  const base = {
    turnId: 'turn_1',
    userMessage: 'log a visit and bump the deal',
    agentName: 'Test App',
    timestamp: '2026-07-29T00:00:00.000Z',
  };

  it('emits nothing when no billable trace was recorded', () => {
    expect(
      buildTurnCostRows({ ...base, operations: [{ operationType: 'x', operationIndex: 0 }], traces: [] }),
    ).toEqual([]);
  });

  it('marks a single-operation turn as a clean sole measurement', () => {
    const rows = buildTurnCostRows({
      ...base,
      operations: [{ operationType: 'create.activity.visit', operationIndex: 0 }],
      traces: ['t1', 't2'],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].biz_allocationmethod).toBe('sole');
    expect(rows[0].biz_operationtype).toBe('create.activity.visit');
    expect(rows[0].crf5c_sessionid).toBe('turn_1#0');
    expect(rows[0].biz_creditsconsumed).toBeUndefined();
  });

  it('gives every row of a multi-operation turn the same traces and divisor', () => {
    const rows = buildTurnCostRows({
      ...base,
      operations: [
        { operationType: 'create.activity.visit', operationIndex: 0 },
        { operationType: 'update.opportunity', operationIndex: 1 },
      ],
      traces: ['t1', 't2'],
    });

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.biz_allocationmethod).toBe('shared');
      // Self-describing rows: summing credit/divisor across the turn's rows
      // reconstructs the exact turn total with no cross-row coordination.
      expect(JSON.parse(row.biz_aieventtracelist as string)).toEqual({
        v: 1,
        traces: ['t1', 't2'],
        divisor: 2,
      });
    }
    expect(rows.map((r) => r.crf5c_sessionid)).toEqual(['turn_1#0', 'turn_1#1']);
  });

  it('keeps a unique session id per row so read-back never collides', () => {
    const rows = buildTurnCostRows({
      ...base,
      operations: [
        { operationType: 'a', operationIndex: 0 },
        { operationType: 'b', operationIndex: 1 },
        { operationType: 'c', operationIndex: 2 },
      ],
      traces: ['t1'],
    });
    expect(new Set(rows.map((r) => r.crf5c_sessionid)).size).toBe(3);
  });

  it('truncates the stored user message', () => {
    const rows = buildTurnCostRows({
      ...base,
      userMessage: 'x'.repeat(5000),
      operations: [{ operationType: 'a', operationIndex: 0 }],
      traces: ['t1'],
      queryMaxChars: 100,
    });
    expect((rows[0].crf5c_querytext as string).length).toBe(100);
  });
});
