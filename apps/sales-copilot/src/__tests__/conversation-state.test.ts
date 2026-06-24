import { describe, it, expect } from 'vitest';
import {
  computeArgumentsHash,
  normalizeArg,
  commitConversationState,
  hydrateConversationState,
  buildRollingSummary,
  decayFocus,
  emptyState,
  serializeStateForPrompt,
  FOCUS_DECAY,
  FOCUS_MIN_CONFIDENCE,
  MAX_WORKING_SETS_PER_ENTITY,
  ROLLING_SUMMARY_MAX_CHARS,
  WORKING_SET_TTL_MS,
  type ConversationState,
  type FocusEntity,
  type StateMutation,
} from '@/lib/conversation-state';
import { resolveDataSource } from '@/lib/data-source-resolver';
import { resolveAnaphora } from '@/lib/anaphora';

const NOW = new Date('2026-06-11T10:00:00');

function focus(partial: Partial<FocusEntity>): FocusEntity {
  return {
    type: 'account',
    name: 'X',
    confidence: 0.9,
    source: 'query-result',
    turnIntroduced: 0,
    ...partial,
  };
}

// ── A2 normalizeArg ──────────────────────────────────────────────────────────
describe('normalizeArg (§5.1)', () => {
  it('lowercases and trims enum values', () => {
    expect(normalizeArg('stage', ' Negotiation ')).toBe('negotiation');
    expect(normalizeArg('type', 'CALL')).toBe('call');
  });

  it('resolves relative dateRange to an absolute local-day range', () => {
    expect(normalizeArg('dateRange', 'today', NOW)).toBe(
      JSON.stringify(['2026-06-11T00:00', '2026-06-11T23:59']),
    );
    expect(normalizeArg('dateRange', 'tomorrow', NOW)).toBe(
      JSON.stringify(['2026-06-12T00:00', '2026-06-12T23:59']),
    );
  });

  it('truncates absolute dates to day', () => {
    expect(normalizeArg('scheduledDate', '2026-06-11T08:00Z')).toBe('2026-06-11');
  });

  it('lowercases GUID ids', () => {
    expect(normalizeArg('accountId', 'A1B2-C3')).toBe('a1b2-c3');
  });

  it('converts amounts with units to numbers', () => {
    expect(normalizeArg('minAmount', '200k')).toBe(200000);
    expect(normalizeArg('minAmount', '50万')).toBe(500000);
    expect(normalizeArg('minAmount', 200000)).toBe(200000);
  });

  it('trims and lowercases free-text names without tokenizing', () => {
    expect(normalizeArg('name', ' Royal London ')).toBe('royal london');
  });
});

// ── A3 computeArgumentsHash ───────────────────────────────────────────────────
describe('computeArgumentsHash (§5.1)', () => {
  it('produces the same hash for synonymous args', () => {
    const a = computeArgumentsHash('queryOpportunities', { stage: 'Negotiation' });
    const b = computeArgumentsHash('queryOpportunities', { stage: ' negotiation ' });
    expect(a).toBe(b);
  });

  it('differs when dateRange is present vs absent', () => {
    const withRange = computeArgumentsHash('queryActivities', { dateRange: 'today' }, NOW);
    const without = computeArgumentsHash('queryActivities', {}, NOW);
    expect(withRange).not.toBe(without);
  });

  it('ignores limit/sortBy (display-only params)', () => {
    const a = computeArgumentsHash('queryActivities', { type: 'call', limit: 10 });
    const b = computeArgumentsHash('queryActivities', { type: 'call', limit: 50, sortBy: 'date' });
    expect(a).toBe(b);
  });

  it('is order-independent', () => {
    const a = computeArgumentsHash('queryOpportunities', { stage: 'open', accountId: 'A1' });
    const b = computeArgumentsHash('queryOpportunities', { accountId: 'A1', stage: 'open' });
    expect(a).toBe(b);
  });
});

// ── A4 commit ─────────────────────────────────────────────────────────────────
describe('commitConversationState (§5.3)', () => {
  it('overwrites a working set on the same hash, appends on a different hash', () => {
    let s = emptyState();
    const m1: StateMutation = {
      executedFunction: 'queryActivities',
      executedArgsHash: 'queryActivities|{"type":"call"}',
      resultRecords: [{ id: '1', title: 'a' }],
    };
    s = commitConversationState(s, m1, NOW.getTime());
    expect(s.workingSets).toHaveLength(1);

    // same hash -> overwrite (still 1)
    s = commitConversationState(s, { ...m1, resultRecords: [{ id: '2', title: 'b' }] }, NOW.getTime());
    expect(s.workingSets).toHaveLength(1);
    expect(s.workingSets[0].records[0].id).toBe('2');

    // different hash -> append (now 2)
    s = commitConversationState(
      s,
      { ...m1, executedArgsHash: 'queryActivities|{"type":"email"}', resultRecords: [{ id: '3', title: 'c' }] },
      NOW.getTime(),
    );
    expect(s.workingSets).toHaveLength(2);
  });

  it('stores raw rows on the working set for reuse replay (B5)', () => {
    let s = emptyState();
    const rawRows = [{ id: '1', name1: 'Acme', amount: 1000, stage: 'negotiation' }];
    s = commitConversationState(
      s,
      {
        executedFunction: 'queryOpportunities',
        executedArgsHash: 'h',
        resultRecords: [{ id: '1', title: 'Acme' }],
        rawResultRecords: rawRows,
      },
      NOW.getTime(),
    );
    expect(s.workingSets[0].rawRecords).toEqual(rawRows);
    // a hydrate pass must preserve rawRecords (so reuse still works next turn)
    const h = hydrateConversationState({ prevState: s, turn: 1, now: NOW.getTime() + 1000 });
    expect(h.workingSets[0].rawRecords).toEqual(rawRows);
  });

  it('evicts the oldest working set beyond the per-entity cap', () => {
    let s = emptyState();
    for (let i = 0; i < MAX_WORKING_SETS_PER_ENTITY + 2; i++) {
      s = commitConversationState(
        s,
        {
          executedFunction: 'queryActivities',
          executedArgsHash: `queryActivities|{"type":"t${i}"}`,
          resultRecords: [{ id: String(i), title: `r${i}` }],
        },
        NOW.getTime() + i,
      );
    }
    expect(s.workingSets).toHaveLength(MAX_WORKING_SETS_PER_ENTITY);
    // oldest (t0, t1) evicted
    expect(s.workingSets.some((w) => w.argumentsHash.includes('t0'))).toBe(false);
  });

  it('does not write a working set when the mutation carries no records (failure)', () => {
    let s = emptyState();
    s = commitConversationState(
      s,
      { executedFunction: 'queryActivities', executedArgsHash: 'h', summaryNote: '查询失败' },
      NOW.getTime(),
    );
    expect(s.workingSets).toHaveLength(0);
    expect(s.rollingSummary).toContain('查询失败');
  });

  it('marks related working sets stale after a write', () => {
    let s = emptyState();
    s = commitConversationState(
      s,
      {
        executedFunction: 'queryActivities',
        executedArgsHash: 'h',
        resultRecords: [{ id: '1', title: 'a' }],
      },
      NOW.getTime(),
    );
    s = commitConversationState(s, { invalidatedEntities: ['activity'] }, NOW.getTime());
    expect(s.workingSets[0].stale).toBe(true);
  });

  it('promotes a created record to the highest-confidence focus', () => {
    let s = emptyState();
    s = commitConversationState(
      s,
      { createdRecord: { type: 'opportunity', id: 'o1', name: 'New OR' } },
      NOW.getTime(),
    );
    expect(s.focus[0].id).toBe('o1');
    expect(s.focus[0].source).toBe('created-record');
  });
});

// ── A5 decay + hydrate ────────────────────────────────────────────────────────
describe('focus decay + hydrate (§5.2 / §5.4)', () => {
  it('multiplies confidence by FOCUS_DECAY each step', () => {
    const decayed = decayFocus([focus({ confidence: 1 })]);
    expect(decayed[0].confidence).toBeCloseTo(FOCUS_DECAY);
  });

  it('drops below FOCUS_MIN_CONFIDENCE after enough turns (not used for anaphora)', () => {
    let f = [focus({ confidence: 0.9 })];
    for (let i = 0; i < 5; i++) f = decayFocus(f);
    expect(f[0].confidence).toBeLessThan(FOCUS_MIN_CONFIDENCE);
  });

  it('marks working sets past TTL stale but keeps them', () => {
    const prev: ConversationState = {
      ...emptyState(),
      workingSets: [
        {
          id: 'w1',
          entity: 'activity',
          sourceFunction: 'queryActivities',
          argumentsHash: 'h',
          filterSummary: '',
          records: [{ id: '1', title: 'a' }],
          createdAt: NOW.getTime() - WORKING_SET_TTL_MS - 1000,
          stale: false,
        },
      ],
    };
    const s = hydrateConversationState({ prevState: prev, turn: 2, now: NOW.getTime() });
    expect(s.workingSets).toHaveLength(1);
    expect(s.workingSets[0].stale).toBe(true);
  });

  it('injects page-context entity as high-confidence focus', () => {
    const s = hydrateConversationState({
      prevState: emptyState(),
      turn: 1,
      now: NOW.getTime(),
      pageContext: { entityType: 'account', entityId: 'a1', entityName: 'Cleveland Clinic' },
    });
    expect(s.focus[0].name).toBe('Cleveland Clinic');
    expect(s.focus[0].source).toBe('page');
  });
});

// ── A6 buildRollingSummary ────────────────────────────────────────────────────
describe('buildRollingSummary (§5.5)', () => {
  it('keeps only business facts from overflow', () => {
    const summary = buildRollingSummary('', [
      { recordList: { type: 'opportunity', records: [1, 2, 3] } },
      { createdRecord: { type: 'activity', name: '回访' } },
    ]);
    expect(summary).toContain('查询商机：3 条');
    expect(summary).toContain('新建活动「回访」');
  });

  it('caps length keeping the most recent facts', () => {
    const long = 'x'.repeat(ROLLING_SUMMARY_MAX_CHARS + 100);
    const summary = buildRollingSummary(long, [{ createdRecord: { type: 'account', name: 'tail' } }]);
    expect(summary.length).toBeLessThanOrEqual(ROLLING_SUMMARY_MAX_CHARS);
    expect(summary).toContain('tail');
  });
});

// ── A7 resolveDataSource ──────────────────────────────────────────────────────
describe('resolveDataSource (§6)', () => {
  function stateWithSet(fn: string, args: Record<string, unknown>): ConversationState {
    const s = emptyState();
    return commitConversationState(
      s,
      {
        executedFunction: fn,
        executedArgsHash: computeArgumentsHash(fn, args, NOW),
        resultRecords: [{ id: '1', title: 'a' }],
      },
      NOW.getTime(),
    );
  }

  it('reuses a fresh working set with the same hash', () => {
    const s = stateWithSet('queryOpportunities', { stage: 'negotiation' });
    const ds = resolveDataSource(
      { fn: 'queryOpportunities', args: { stage: 'negotiation' } },
      s,
      undefined,
      NOW,
    );
    expect(ds.kind).toBe('reuse');
  });

  it('requeries when the hash differs (e.g. dateRange added)', () => {
    const s = stateWithSet('queryActivities', {});
    const ds = resolveDataSource(
      { fn: 'queryActivities', args: { dateRange: 'today' } },
      s,
      undefined,
      NOW,
    );
    expect(ds.kind).toBe('requery');
  });

  it('requeries when user explicitly asks to refresh', () => {
    const s = stateWithSet('queryActivities', { type: 'call' });
    const ds = resolveDataSource(
      { fn: 'queryActivities', args: { type: 'call' }, userRequestedRefresh: true },
      s,
      undefined,
      NOW,
    );
    expect(ds.kind).toBe('requery');
  });

  it('uses page data when the page covers an unfiltered query', () => {
    const ds = resolveDataSource(
      { fn: 'queryActivities', args: {} },
      emptyState(),
      { entityType: 'activity' },
      NOW,
    );
    expect(ds.kind).toBe('page');
  });
});

// ── A8 anaphora ───────────────────────────────────────────────────────────────
describe('resolveAnaphora (§7)', () => {
  function stateWithFocus(focuses: FocusEntity[]): ConversationState {
    return { ...emptyState(), focus: focuses };
  }

  it('resolves a typed singular to the matching focus', () => {
    const s = stateWithFocus([focus({ type: 'account', id: 'a1', name: 'Cleveland' })]);
    const r = resolveAnaphora(s, { kind: 'singular', entityType: 'account' });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.entity.id).toBe('a1');
  });

  it('asks (ambiguous) when type is unclear and top confidence ties', () => {
    const s = stateWithFocus([
      focus({ type: 'account', id: 'a1', confidence: 0.8 }),
      focus({ type: 'opportunity', id: 'o1', confidence: 0.8 }),
    ]);
    const r = resolveAnaphora(s, { kind: 'singular' });
    expect(r.status).toBe('ambiguous');
  });

  it('resolves an untyped singular to the unique highest-confidence focus', () => {
    const s = stateWithFocus([
      focus({ type: 'account', id: 'a1', confidence: 0.9 }),
      focus({ type: 'opportunity', id: 'o1', confidence: 0.6 }),
    ]);
    const r = resolveAnaphora(s, { kind: 'singular' });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.entity.id).toBe('a1');
  });

  it('takes the Nth record of the latest working set for ordinals', () => {
    let s = emptyState();
    s = commitConversationState(
      s,
      {
        executedFunction: 'queryOpportunities',
        executedArgsHash: 'h',
        resultRecords: [
          { id: 'o1', title: 'first' },
          { id: 'o2', title: 'second' },
        ],
      },
      NOW.getTime(),
    );
    const r = resolveAnaphora(s, { kind: 'ordinal', ordinal: 2 });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.entity.id).toBe('o2');
  });

  it('signals needs-requery when the working set is stale for an ordinal', () => {
    let s = emptyState();
    s = commitConversationState(
      s,
      { executedFunction: 'queryOpportunities', executedArgsHash: 'h', resultRecords: [{ id: 'o1', title: 'x' }] },
      NOW.getTime(),
    );
    s = commitConversationState(s, { invalidatedEntities: ['opportunity'] }, NOW.getTime());
    const r = resolveAnaphora(s, { kind: 'ordinal', ordinal: 1, entityType: 'opportunity' });
    expect(r.status).toBe('needs-requery');
  });

  it('returns the whole set for plural references', () => {
    let s = emptyState();
    s = commitConversationState(
      s,
      {
        executedFunction: 'queryAccounts',
        executedArgsHash: 'h',
        resultRecords: [
          { id: '1', title: 'a' },
          { id: '2', title: 'b' },
        ],
      },
      NOW.getTime(),
    );
    const r = resolveAnaphora(s, { kind: 'plural' });
    expect(r.status).toBe('resolved-set');
    if (r.status === 'resolved-set') expect(r.records).toHaveLength(2);
  });
});

// ── serializeStateForPrompt (§9) ──────────────────────────────────────────────
describe('serializeStateForPrompt (§9)', () => {
  it('emits plain-text blocks for focus, working set, pending goal and summary', () => {
    let s = emptyState();
    s = commitConversationState(
      s,
      {
        executedFunction: 'queryOpportunities',
        executedArgsHash: 'h',
        filterSummary: 'stage=negotiation',
        resultRecords: [{ id: 'o1', title: 'New OR' }],
        createdRecord: undefined,
      },
      NOW.getTime(),
    );
    s.focus = [focus({ type: 'opportunity', id: 'o1', name: 'New OR', confidence: 0.95 })];
    s.pendingGoal = {
      fn: 'draftActivity',
      state: 'FILLING',
      requiredSlots: ['scheduledDate'],
      filledSlots: {},
      turnOpened: 1,
    };
    s.rollingSummary = '跟进 Cleveland 项目';
    const text = serializeStateForPrompt(s);
    expect(text).toContain('[Focus]');
    expect(text).toContain('[Working set]');
    expect(text).toContain('[Pending goal] draftActivity — missing: scheduledDate');
    expect(text).toContain('[Summary]');
  });

  it('omits focus below the confidence threshold', () => {
    const s = { ...emptyState(), focus: [focus({ confidence: FOCUS_MIN_CONFIDENCE - 0.1 })] };
    expect(serializeStateForPrompt(s)).not.toContain('[Focus]');
  });
});
