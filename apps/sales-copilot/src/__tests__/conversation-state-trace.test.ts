import { describe, it, expect } from 'vitest';
import {
  hydrateConversationState,
  commitConversationState,
  computeArgumentsHash,
  emptyState,
  FOCUS_DECAY,
  type ConversationState,
  type StateMutation,
} from '@/lib/conversation-state';
import { resolveDataSource } from '@/lib/data-source-resolver';
import { resolveAnaphora } from '@/lib/anaphora';

/**
 * §12 end-to-end trace as an executable spec (task C2, pure-function layer).
 *
 * This drives the conversation-state pure functions through the exact six-turn
 * dialogue documented in §12 and asserts the state evolution matches the
 * "designer intent" reference. It validates the design's internal consistency
 * without the LLM, UI or a build. The agent-level decisions (which mutation to
 * emit each turn) are modelled here as the documented StateMutation; this test
 * pins that the state functions produce the documented snapshots given those
 * decisions.
 */
describe('§12 six-turn trace (C2 regression)', () => {
  const t0 = new Date('2026-06-11T09:00:00').getTime();
  const oppHash = computeArgumentsHash('queryOpportunities', { accountId: 'cleveland-1' });
  const todayHash = computeArgumentsHash('queryActivities', { dateRange: 'today' }, new Date(t0));

  it('evolves state correctly across the documented dialogue', () => {
    let state: ConversationState = emptyState();

    // ── Turn 1: "Cleveland 的商机进展如何" ────────────────────────────────────
    state = hydrateConversationState({ prevState: state, turn: 0, now: t0 });
    // resolveDataSource → requery (no working set yet)
    expect(
      resolveDataSource({ fn: 'queryOpportunities', args: { accountId: 'cleveland-1' } }, state, undefined, new Date(t0)).kind,
    ).toBe('requery');
    const turn1: StateMutation = {
      executedFunction: 'queryOpportunities',
      executedArgsHash: oppHash,
      filterSummary: 'account=Cleveland',
      resultRecords: [
        { id: 'opp-1', title: 'Cleveland new OR', summary: '900000' },
        { id: 'opp-2', title: 'Cleveland ICU', summary: '500000' },
        { id: 'opp-3', title: 'Cleveland lab', summary: '300000' },
        { id: 'opp-4', title: 'Cleveland imaging', summary: '200000' },
      ],
      resolvedFocus: [
        { type: 'account', id: 'cleveland-1', name: 'Cleveland Clinic', confidence: 0.9, source: 'query-result', turnIntroduced: 1 },
      ],
    };
    state = commitConversationState(state, turn1, t0);
    expect(state.workingSets).toHaveLength(1);
    expect(state.workingSets[0].records).toHaveLength(4);
    expect(state.workingSets[0].stale).toBe(false);
    expect(state.focus[0]).toMatchObject({ type: 'account', name: 'Cleveland Clinic', confidence: 0.9 });

    // ── Turn 2: "哪个金额最高" ────────────────────────────────────────────────
    state = hydrateConversationState({ prevState: state, turn: 1, now: t0 + 1000 });
    // account focus decays 0.9 → 0.72
    const acct = state.focus.find((f) => f.type === 'account')!;
    expect(acct.confidence).toBeCloseTo(0.9 * FOCUS_DECAY);
    // resolveDataSource → reuse (same hash, not stale)
    const ds2 = resolveDataSource(
      { fn: 'queryOpportunities', args: { accountId: 'cleveland-1' } },
      state,
      undefined,
      new Date(t0 + 1000),
    );
    expect(ds2.kind).toBe('reuse');
    // analysis only; commit promotes the highest-amount opportunity to focus
    const turn2: StateMutation = {
      resolvedFocus: [
        { type: 'opportunity', id: 'opp-1', name: 'Cleveland new OR', confidence: 0.9, source: 'query-result', turnIntroduced: 2 },
      ],
    };
    state = commitConversationState(state, turn2, t0 + 1000);
    expect(state.focus[0]).toMatchObject({ type: 'opportunity', id: 'opp-1', confidence: 0.9 });
    expect(state.focus.find((f) => f.type === 'account')!.confidence).toBeCloseTo(0.72);

    // ── Turn 3: "今天有哪些任务" — the regression point (must requery) ──────────
    state = hydrateConversationState({ prevState: state, turn: 2, now: t0 + 2000 });
    const ds3 = resolveDataSource(
      { fn: 'queryActivities', args: { dateRange: 'today' } },
      state,
      undefined,
      new Date(t0 + 2000),
    );
    expect(ds3.kind).toBe('requery'); // ← must NOT reuse the opportunities set
    const turn3: StateMutation = {
      executedFunction: 'queryActivities',
      executedArgsHash: todayHash,
      filterSummary: 'dateRange=today',
      resultRecords: [
        { id: 'act-1', title: 'Call Dr. Lee' },
        { id: 'act-2', title: 'Visit Cleveland' },
        { id: 'act-3', title: 'Email proposal' },
        { id: 'act-4', title: 'Review contract' },
        { id: 'act-5', title: 'Prep demo' },
      ],
    };
    state = commitConversationState(state, turn3, t0 + 2000);
    const actSet = state.workingSets.find((w) => w.sourceFunction === 'queryActivities')!;
    expect(actSet.records).toHaveLength(5); // ← 5, never 0
    expect(state.workingSets.find((w) => w.sourceFunction === 'queryOpportunities')).toBeDefined();

    // ── Turn 4: "帮我给第一个客户登记一次拜访" → pendingGoal OPEN ────────────────
    state = hydrateConversationState({ prevState: state, turn: 3, now: t0 + 3000 });
    // §5.4 verified: by turn 4 the account focus has decayed 0.9×0.8³ = 0.4608,
    // below FOCUS_MIN_CONFIDENCE (0.5), so it must NOT auto-resolve.
    const decayedAcct = state.focus.find((f) => f.type === 'account')!;
    expect(decayedAcct.confidence).toBeCloseTo(0.9 * FOCUS_DECAY ** 3);
    const anaDecayed = resolveAnaphora(state, { kind: 'singular', entityType: 'account' });
    expect(anaDecayed.status).toBe('none'); // decayed below threshold → agent must re-resolve
    // The agent re-resolves "第一个客户" (the conversation subject) to Cleveland
    // Clinic and opens the draft goal with the account slot filled.
    const turn4: StateMutation = {
      resolvedFocus: [
        { type: 'account', id: 'cleveland-1', name: 'Cleveland Clinic', confidence: 0.9, source: 'user-mention', turnIntroduced: 4 },
      ],
      pendingGoal: {
        fn: 'draftActivity',
        state: 'OPEN',
        requiredSlots: ['scheduledDate'],
        filledSlots: { account: 'cleveland-1' },
        nextQuestion: '安排在什么时候？',
        turnOpened: 4,
      },
    };
    state = commitConversationState(state, turn4, t0 + 3000);
    expect(state.pendingGoal).toMatchObject({ fn: 'draftActivity', state: 'OPEN' });
    expect(state.pendingGoal!.filledSlots).toHaveProperty('account');
    // re-resolved account is back at full confidence
    expect(state.focus.find((f) => f.type === 'account')!.confidence).toBeCloseTo(0.9);

    // ── Turn 5: "顺便看看 Mayo 的联系人" (off-topic) → pendingGoal suspended ─────
    state = hydrateConversationState({ prevState: state, turn: 4, now: t0 + 4000 });
    // off-topic query executes; pendingGoal is NOT cleared (omitted from mutation)
    const turn5: StateMutation = {
      executedFunction: 'queryContacts',
      executedArgsHash: computeArgumentsHash('queryContacts', { name: 'Mayo' }),
      resultRecords: [{ id: 'c-1', title: 'Dr. Mayo Contact' }],
      // no pendingGoal field → commit leaves it intact
    };
    state = commitConversationState(state, turn5, t0 + 4000);
    expect(state.pendingGoal).toBeDefined(); // ← off-topic protection: still OPEN
    expect(state.pendingGoal!.state).toBe('OPEN');
    expect(state.workingSets.find((w) => w.sourceFunction === 'queryContacts')).toBeDefined();

    // ── Turn 6: "明天下午" → fills the slot, FILLING→READY ──────────────────────
    state = hydrateConversationState({ prevState: state, turn: 5, now: t0 + 5000 });
    const turn6: StateMutation = {
      pendingGoal: {
        fn: 'draftActivity',
        state: 'READY',
        requiredSlots: ['scheduledDate'],
        filledSlots: { account: 'cleveland-1', scheduledDate: '2026-06-12' },
        turnOpened: 4,
      },
    };
    state = commitConversationState(state, turn6, t0 + 5000);
    expect(state.pendingGoal!.state).toBe('READY');
    expect(state.pendingGoal!.filledSlots).toMatchObject({
      account: 'cleveland-1',
      scheduledDate: '2026-06-12',
    });
  });
});
