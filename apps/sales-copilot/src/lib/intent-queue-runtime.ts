/**
 * IntentQueue runtime — async executor and user-action dispatcher.
 *
 * All side effects (executeFunction calls, chat-message rendering, toast
 * notifications) live here. The reducer in intent-queue.ts stays pure.
 *
 * Driving model:
 *   - Caller (copilot-context) calls `runQueue(queue, deps)` after any state
 *     change. Runtime walks the cursor forward, resolving and executing each
 *     intent. Returns when:
 *       a) queue.done === true (all intents terminal), or
 *       b) current intent is awaiting user input (status === 'awaiting-user'
 *          or 'executing') and the runtime has rendered the appropriate card.
 *   - User actions on cards (Save / Cancel / Pick / Create / Skip / Search /
 *     awaiting-clarification reply) call the matching `handleXxx(queue, ...)`
 *     helper here, which mutates queue state and then re-enters runQueue.
 */

import { executeFunction } from './function-executor';
import {
  advanceCursor,
  buildEffectiveArgs,
  currentIntent,
  dropFirstResolution,
  findIntent,
  insertSubIntentAfterCursor,
  mergeIntentArgs,
  mergeResolvedContext,
  patchIntent,
  replaceFirstResolutionQuery,
  type IntentQueue,
  type QueueIntent,
} from './intent-queue';
import type { ResolutionItem } from './agent-utils';

// ---------- card-message shapes (shared with copilot-context) ----------
// Kept loose (Record<string, unknown>) here to avoid an import cycle; the
// caller asserts the right ChatMessage type when adding to state.

export type CardMessage = Record<string, unknown> & {
  id: string;
  type: 'agent' | 'form-card' | 'match-selection' | 'awaiting-clarification';
  content: string;
  timestamp: number;
  queueId: string;
  queueIntentId: string;
};

// ---------- runtime deps ----------

export interface RuntimeDeps {
  userId?: string;
  userEmail?: string;
  locale: 'zh-Hans' | 'en-US';
  /** Add a card / agent message to the chat. */
  pushMessage: (msg: CardMessage) => void;
  /** Patch an existing message (used to flip awaiting → resolved on cards). */
  patchMessage: (id: string, patch: Record<string, unknown>) => void;
  /** Notify React-Query to invalidate after writes. Each entry is a queryKey (string for simple keys). */
  invalidate: (keys?: string[]) => void;
  /** Show a transient toast (success / info). */
  toast: (kind: 'success' | 'info' | 'error', msg: string) => void;
}

// ---------- top-level driver ----------

// ---------- narration ----------

function topLevelIntents(queue: IntentQueue): QueueIntent[] {
  return queue.intents.filter((i) => !i.parentId);
}

function stepPosition(queue: IntentQueue, intent: QueueIntent): { idx: number; total: number } {
  const top = topLevelIntents(queue);
  const i = top.findIndex((x) => x.id === intent.id);
  return { idx: i >= 0 ? i + 1 : 0, total: top.length };
}

function labelFor(intent: QueueIntent, isZh: boolean): string {
  if (intent.userFacingLabel) return isZh ? intent.userFacingLabel.zh : intent.userFacingLabel.en;
  const map: Record<string, [string, string]> = {
    draftActivity: ['记录活动', 'Log activity'],
    draftOpportunity: ['新建商机', 'Create opportunity'],
    draftAccount: ['新建客户', 'Create account'],
    draftContact: ['新建联系人', 'Create contact'],
    updateActivity: ['更新活动', 'Update activity'],
    updateOpportunity: ['更新商机', 'Update opportunity'],
    updateAccount: ['更新客户', 'Update account'],
    updateContact: ['更新联系人', 'Update contact'],
  };
  const [zh, en] = map[intent.function] ?? [intent.function, intent.function];
  return isZh ? zh : en;
}

function emitAnnounce(queue: IntentQueue, intent: QueueIntent, deps: RuntimeDeps): IntentQueue {
  if (intent.announced || intent.parentId) return queue;
  const { idx, total } = stepPosition(queue, intent);
  // Single-step queues skip narration — the ack + card carry enough context.
  if (total <= 1) return patchIntent(queue, intent.id, { announced: true });
  const isZh = deps.locale === 'zh-Hans';
  const label = labelFor(intent, isZh);
  const content = isZh
    ? `正在处理第 ${idx} / ${total} 步：${label}`
    : `Starting step ${idx} of ${total}: ${label}`;
  deps.pushMessage({
    id: `narrate-${queue.id}-${intent.id}-announce-${Date.now()}`,
    type: 'agent',
    content,
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    taskRole: 'announce',
  });
  return patchIntent(queue, intent.id, { announced: true });
}

type ResultAction = 'created' | 'updated' | 'cancelled' | 'failed' | 'completed';

function emitResult(
  queue: IntentQueue,
  intent: QueueIntent,
  action: ResultAction,
  recordName: string | undefined,
  deps: RuntimeDeps,
): void {
  if (intent.parentId) return;
  const isZh = deps.locale === 'zh-Hans';
  const { idx, total } = stepPosition(queue, intent);
  const label = labelFor(intent, isZh);
  const actionText = isZh
    ? (action === 'created' ? (recordName ? `已新建 ${recordName}` : '已新建')
      : action === 'updated' ? (recordName ? `已更新 ${recordName}` : '已更新')
      : action === 'cancelled' ? '已取消'
      : action === 'failed' ? '执行失败'
      : '已完成')
    : (action === 'created' ? (recordName ? `Created ${recordName}` : 'Created')
      : action === 'updated' ? (recordName ? `Updated ${recordName}` : 'Updated')
      : action === 'cancelled' ? 'Cancelled'
      : action === 'failed' ? 'Failed'
      : 'Done');
  const icon = action === 'failed' ? '✗' : action === 'cancelled' ? '◌' : '✓';
  const prefix = total > 1 && idx > 0
    ? (isZh ? `第 ${idx} 步（${label}）` : `Step ${idx} (${label})`)
    : label;
  const content = `${icon} ${prefix}：${actionText}`;
  deps.pushMessage({
    id: `narrate-${queue.id}-${intent.id}-result-${Date.now()}`,
    type: 'agent',
    content,
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    taskRole: 'substep',
  });
}

function emitSummary(queue: IntentQueue, deps: RuntimeDeps): IntentQueue {
  if (queue.summaryEmitted) return queue;
  const top = topLevelIntents(queue);
  if (top.length <= 1) return { ...queue, summaryEmitted: true };
  const isZh = deps.locale === 'zh-Hans';
  const lines = top.map((i, k) => {
    const label = labelFor(i, isZh);
    const name = i.result?.recordName;
    const verb = i.status === 'confirmed'
      ? (i.function.startsWith('update') ? (isZh ? '已更新' : 'updated') : (isZh ? '已新建' : 'created'))
      : i.status === 'cancelled' ? (isZh ? '已取消' : 'cancelled')
      : i.status === 'skipped' ? (isZh ? '已跳过' : 'skipped')
      : i.status === 'failed' ? (isZh ? '执行失败' : 'failed')
      : (isZh ? '已处理' : 'done');
    return isZh
      ? `${k + 1}. ${label}：${verb}${name ? ` ${name}` : ''}`
      : `${k + 1}. ${label}: ${verb}${name ? ` ${name}` : ''}`;
  });
  const header = isZh ? `全部 ${top.length} 步已完成：` : `All ${top.length} steps completed:`;
  deps.pushMessage({
    id: `narrate-${queue.id}-summary-${Date.now()}`,
    type: 'agent',
    content: `${header}\n${lines.join('\n')}`,
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: 'summary',
    taskRole: 'summary',
  });
  return { ...queue, summaryEmitted: true };
}

// ---------- driver ----------

/**
 * Drive the queue forward from its current cursor until blocked or done.
 * Pure-ish: returns the new queue; never mutates the input.
 */
export async function runQueue(queue: IntentQueue, deps: RuntimeDeps): Promise<IntentQueue> {
  let q = queue;
  // Hard cap to avoid runaway loops in case of bug.
  for (let safety = 0; safety < 50; safety++) {
    const cur = currentIntent(q);
    if (!cur) {
      q = emitSummary(q, deps);
      return { ...q, done: true, cursor: -1 };
    }
    if (cur.status === 'awaiting-user' || cur.status === 'executing') {
      // Already blocked: caller will resume on next user event.
      return q;
    }
    if (cur.status !== 'queued' && cur.status !== 'resolving') {
      // Already terminal (confirmed/cancelled/skipped/failed) — advance.
      q = advanceCursor(q);
      continue;
    }
    q = await stepCurrent(q, deps);
  }
  console.warn('[IntentQueueRuntime] safety break — queue did not converge', q);
  return q;
}

/**
 * Execute one cursor step: resolve all resolutions for the current intent,
 * then either execute it (non-draft) or render its form-card (draft).
 */
async function stepCurrent(queue: IntentQueue, deps: RuntimeDeps): Promise<IntentQueue> {
  let q = queue;
  let cur = currentIntent(q)!;

  // Narrate step start the first time we touch this intent.
  q = emitAnnounce(q, cur, deps);
  cur = currentIntent(q)!;

  // 1) Resolve every pending resolution serially. runOneResolution returns
  //    an updated queue with EITHER the head resolution consumed (drop +
  //    context merged) OR status flipped to 'awaiting-user' (card rendered).
  while (cur.resolutions.length > 0) {
    q = await runOneResolution(q, cur, cur.resolutions[0], deps);
    const next = currentIntent(q);
    if (!next) return q;
    if (next.status === 'awaiting-user') return q;
    cur = next;
  }

  // 2) Implicit per-step fuzzy-match for additional-intent name fields
  //    (parity with old processAdditionalIntents behaviour for draftActivity / Opp / Contact
  //    that have accountName / contactName / opportunityName but no id).
  q = await implicitNameResolution(q, cur, deps);
  cur = currentIntent(q)!;

  // 3) Execute the function.
  return await executeIntent(q, cur, deps);
}

/**
 * Resolve one ResolutionItem at the head of the current intent's queue.
 * Returns the updated queue. Inspect the head intent's status afterward:
 *   - status === 'awaiting-user' → card rendered, caller should stop.
 *   - resolutions length decreased → auto-resolved, caller may loop.
 *   - else (no high-conf, non-draft) → resolution silently dropped.
 */
async function runOneResolution(
  queue: IntentQueue,
  intent: QueueIntent,
  resolution: ResolutionItem,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const { entityType, query, scopeBy } = resolution;

  // scopeBy: inject parent entity id into the match call.
  const scopeAccountId = scopeBy === 'account' ? queue.resolvedContext.accountId : undefined;

  const fnName =
    entityType === 'account' ? 'fuzzyMatchAccount'
    : entityType === 'contact' ? 'fuzzyMatchContact'
    : entityType === 'activity' ? 'fuzzyMatchActivity'
    : 'fuzzyMatchOpportunity';

  try {
    const matchRes = await executeFunction(
      fnName,
      { query, ...(scopeAccountId ? { accountId: scopeAccountId } : {}) },
      { userId: deps.userId, userEmail: deps.userEmail },
    );

    if (!matchRes.success || !matchRes.data) {
      return dropFirstResolution(queue, intent.id);
    }

    const data = matchRes.data as {
      matches: Array<{ id: string; name: string; score: number; matchType: string; accountId?: string; accountName?: string }>;
      confidence: 'high' | 'medium' | 'low' | 'none';
      exactMatch?: { id: string; name: string; score: number; accountId?: string; accountName?: string };
    };

    const highConf = data.matches.filter((m) => m.score >= 70);
    const singleAuto = highConf.length === 1 && highConf[0].score > 90;

    if (singleAuto) {
      const top = highConf[0];
      const ctx = buildResolvedPatch(entityType, top);
      let next = mergeResolvedContext(queue, ctx);
      next = mergeIntentArgs(next, intent.id, ctx);
      next = dropFirstResolution(next, intent.id);
      console.log('[IntentQueueRuntime] auto-resolved', entityType, '→', top.name);
      return next;
    }

    if (highConf.length >= 1) {
      return renderMatchSelectionCard(queue, intent, resolution, data, deps);
    }

    // 0 high-conf matches.
    const isDraftFn = intent.function.startsWith('draft');
    if (isDraftFn) {
      return renderAwaitingClarificationCard(queue, intent, resolution, data, deps);
    }
    return dropFirstResolution(queue, intent.id);
  } catch (err) {
    console.warn('[IntentQueueRuntime] fuzzy match failed:', err);
    return dropFirstResolution(queue, intent.id);
  }
}

/**
 * Implicit name → id resolution for additional intents (no explicit resolutions[]).
 * Mirrors the old processAdditionalIntents top-of-loop logic so draftOpportunity
 * with accountName but no accountId gets a best-effort accountId before executing.
 */
async function implicitNameResolution(
  queue: IntentQueue,
  intent: QueueIntent,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  if (intent.resolutions.length > 0) return queue;  // explicit chain handled above
  if (!intent.function.startsWith('draft')) return queue;
  if (intent.function === 'draftAccount') return queue;  // accountName IS the new entity

  const args = buildEffectiveArgs(intent, queue.resolvedContext);
  type Lookup = { name: string; idField: string; entityType: 'account' | 'contact' | 'opportunity' };
  const lookups: Lookup[] = [{ name: 'accountName', idField: 'accountId', entityType: 'account' }];
  if (intent.function === 'draftActivity') {
    lookups.push({ name: 'contactName', idField: 'contactId', entityType: 'contact' });
    lookups.push({ name: 'opportunityName', idField: 'opportunityId', entityType: 'opportunity' });
  }

  let q = queue;
  for (const lk of lookups) {
    const nameVal = args[lk.name];
    const idVal = args[lk.idField];
    if (typeof nameVal !== 'string' || !nameVal.trim()) continue;
    if (typeof idVal === 'string' && idVal) continue;
    try {
      const res = await executeFunction(
        'fuzzyMatch',
        { entityType: lk.entityType, query: nameVal.trim() },
        { userId: deps.userId, userEmail: deps.userEmail },
      );
      if (!res.success || !res.data) continue;
      const md = res.data as { matches?: Array<{ id: string; name: string; score: number; accountId?: string; accountName?: string }> };
      const top = (md.matches ?? []).find((m) => m.score >= 90);
      if (!top) continue;
      const patch: Record<string, string> = { [lk.idField]: top.id, [lk.name]: top.name };
      if (lk.entityType === 'contact' && top.accountId && !args.accountId) {
        patch.accountId = top.accountId;
        if (top.accountName) patch.accountName = top.accountName;
      }
      q = mergeIntentArgs(q, intent.id, patch);
      q = mergeResolvedContext(q, patch);
      // Refresh local args view for the next lookup.
      Object.assign(args, patch);
      console.log('[IntentQueueRuntime] implicit-resolved', lk.entityType, '→', top.name);
    } catch (e) {
      console.warn('[IntentQueueRuntime] implicit fuzzyMatch failed:', lk.entityType, e);
    }
  }
  return q;
}

/**
 * Map a fuzzy-match exactMatch into resolvedContext key/value pairs.
 */
function buildResolvedPatch(
  entityType: ResolutionItem['entityType'],
  m: { id: string; name: string; accountId?: string; accountName?: string },
): Record<string, string> {
  if (entityType === 'account') {
    return { accountId: m.id, accountName: m.name };
  }
  if (entityType === 'contact') {
    const out: Record<string, string> = { contactId: m.id, contactName: m.name };
    if (m.accountId) out.accountId = m.accountId;
    if (m.accountName) out.accountName = m.accountName;
    return out;
  }
  if (entityType === 'opportunity') {
    return { opportunityId: m.id, opportunityName: m.name };
  }
  // activity — treat like opportunity slot
  return { activityId: m.id, activityName: m.name };
}

// ---------- card rendering ----------

function renderMatchSelectionCard(
  queue: IntentQueue,
  intent: QueueIntent,
  resolution: ResolutionItem,
  data: {
    matches: Array<{ id: string; name: string; score: number; matchType: string; accountId?: string; accountName?: string }>;
    confidence: 'high' | 'medium' | 'low' | 'none';
    exactMatch?: { id: string; name: string; score: number; accountId?: string; accountName?: string };
  },
  deps: RuntimeDeps,
): IntentQueue {
  const isZh = deps.locale === 'zh-Hans';
  const highConf = data.matches.filter((m) => m.score >= 70);
  const lowConf = data.matches.filter((m) => m.score < 70 && m.score >= 20);
  const messageId = `card-${queue.id}-${intent.id}-match-${Date.now()}`;
  const entityZh = resolution.entityType === 'account' ? '客户'
    : resolution.entityType === 'contact' ? '联系人'
    : resolution.entityType === 'activity' ? '活动'
    : '商机';

  deps.pushMessage({
    id: messageId,
    type: 'match-selection',
    content: isZh
      ? `找到 ${highConf.length} 个${entityZh}匹配，请选择一个：`
      : `Found ${highConf.length} matching ${resolution.entityType}(s). Please pick one:`,
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    matchSelection: {
      entityType: resolution.entityType,
      query: resolution.query,
      matches: highConf,
      lowConfidenceMatches: lowConf,
      confidence: data.confidence,
      pendingIntent: {
        function: intent.function,
        arguments: buildEffectiveArgs(intent, queue.resolvedContext),
      },
    },
  });

  return patchIntent(queue, intent.id, {
    status: 'awaiting-user',
    messageId,
  });
}

function renderAwaitingClarificationCard(
  queue: IntentQueue,
  intent: QueueIntent,
  resolution: ResolutionItem,
  data: { matches: Array<{ id: string; name: string; score: number; accountName?: string }> },
  deps: RuntimeDeps,
): IntentQueue {
  const isZh = deps.locale === 'zh-Hans';
  const messageId = `card-${queue.id}-${intent.id}-await-${Date.now()}`;
  const kind: 'contact' | 'account' | 'opportunity' =
    resolution.entityType === 'activity' ? 'opportunity' : resolution.entityType;
  const kindZh = kind === 'contact' ? '联系人' : kind === 'account' ? '客户' : '商机';
  const topCandidates = data.matches.slice(0, 3).map((m) => ({
    id: m.id,
    name: m.name,
    score: m.score,
    subtitle: m.accountName,
  }));

  deps.pushMessage({
    id: messageId,
    type: 'awaiting-clarification',
    content: isZh
      ? `未找到与 "${resolution.query}" 匹配的${kindZh}。回复"新建"以新建，或回复其他名称重新搜索，或回复"跳过"以不关联。`
      : `No ${kind} matches "${resolution.query}". Reply "create", or reply with another name, or "skip".`,
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    awaitingClarification: {
      kind: 'awaiting-clarification',
      pendingResolutions: [{
        id: `pr-${Date.now()}`,
        kind,
        query: resolution.query,
        candidates: topCandidates,
        status: 'pending',
      }],
      originalIntent: {
        function: intent.function,
        arguments: buildEffectiveArgs(intent, queue.resolvedContext),
      },
    },
  });

  return patchIntent(queue, intent.id, {
    status: 'awaiting-user',
    messageId,
  });
}

// ---------- execution (after all resolutions cleared) ----------

async function executeIntent(
  queue: IntentQueue,
  intent: QueueIntent,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const isZh = deps.locale === 'zh-Hans';
  const effectiveArgs = buildEffectiveArgs(intent, queue.resolvedContext);

  if (intent.function.startsWith('draft')) {
    // Render a form-card and wait for Save / Cancel.
    return await renderFormCard(queue, intent, effectiveArgs, deps);
  }

  // Non-draft (query / update / fuzzyMatch / etc): execute and emit message.
  try {
    const res = await executeFunction(
      intent.function,
      effectiveArgs,
      {
        userId: deps.userId,
        userEmail: deps.userEmail,
        locale: deps.locale,
      },
    );

    if (!res.success) {
      const err = res.error || 'execution failed';
      deps.pushMessage({
        id: `msg-${queue.id}-${intent.id}-err-${Date.now()}`,
        type: 'agent',
        content: isZh ? `执行 ${intent.function} 时出错: ${err}` : `Error executing ${intent.function}: ${err}`,
        timestamp: Date.now(),
        queueId: queue.id,
        queueIntentId: intent.id,
      });
      emitResult(queue, intent, 'failed', undefined, deps);
      let q = patchIntent(queue, intent.id, { status: 'failed', result: { error: err } });
      q = advanceCursor(q);
      return await runQueue(q, deps);
    }

    if (res.invalidateQueries) deps.invalidate(res.invalidateQueries);

    // For update*: just acknowledge briefly.
    if (intent.function.startsWith('update')) {
      emitResult(queue, intent, 'updated', undefined, deps);
    } else {
      // query* — show short summary; detailed cards are not auto-built in queue mode
      // (single-shot queries don't typically appear inside multi-intent runs).
      const count = Array.isArray(res.data) ? res.data.length : 1;
      deps.pushMessage({
        id: `msg-${queue.id}-${intent.id}-res-${Date.now()}`,
        type: 'agent',
        content: isZh ? `已执行 ${displayName(intent.function, isZh)}，找到 ${count} 条记录。` : `Executed ${displayName(intent.function, isZh)}, found ${count} record(s).`,
        timestamp: Date.now(),
        queueId: queue.id,
        queueIntentId: intent.id,
      });
      emitResult(queue, intent, 'completed', undefined, deps);
    }

    let q = patchIntent(queue, intent.id, { status: 'confirmed' });
    q = advanceCursor(q);
    return await runQueue(q, deps);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitResult(queue, intent, 'failed', undefined, deps);
    let q = patchIntent(queue, intent.id, { status: 'failed', result: { error: msg } });
    q = advanceCursor(q);
    return await runQueue(q, deps);
  }
}

async function renderFormCard(
  queue: IntentQueue,
  intent: QueueIntent,
  effectiveArgs: Record<string, unknown>,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const isZh = deps.locale === 'zh-Hans';
  try {
    const res = await executeFunction(
      intent.function,
      effectiveArgs,
      { userId: deps.userId, userEmail: deps.userEmail },
    );
    if (!res.success || !res.data) {
      const err = res.error || 'draft failed';
      deps.pushMessage({
        id: `msg-${queue.id}-${intent.id}-err-${Date.now()}`,
        type: 'agent',
        content: isZh ? `准备草稿失败: ${err}` : `Draft failed: ${err}`,
        timestamp: Date.now(),
        queueId: queue.id,
        queueIntentId: intent.id,
      });
      let q = patchIntent(queue, intent.id, { status: 'failed', result: { error: err } });
      q = advanceCursor(q);
      return await runQueue(q, deps);
    }
    const draftData = res.data as { type: 'activity' | 'opportunity' | 'account' | 'contact'; isNew?: boolean; data: Record<string, unknown> };
    const messageId = `card-${queue.id}-${intent.id}-form-${Date.now()}`;
    deps.pushMessage({
      id: messageId,
      type: 'form-card',
      content: isZh ? '请确认以下信息' : 'Please confirm the following information',
      timestamp: Date.now(),
      queueId: queue.id,
      queueIntentId: intent.id,
      formCard: {
        type: draftData.type,
        isNew: draftData.isNew ?? true,
        data: draftData.data,
        status: 'pending',
      },
    });
    return patchIntent(queue, intent.id, { status: 'executing', messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let q = patchIntent(queue, intent.id, { status: 'failed', result: { error: msg } });
    q = advanceCursor(q);
    return await runQueue(q, deps);
  }
}

function displayName(fn: string, isZh: boolean): string {
  // Lightweight label for ack/err messages. The detailed display-labels
  // module exists but importing it would add a dep cycle; this is sufficient.
  const map: Record<string, [string, string]> = {
    updateActivity: ['更新活动', 'Update Activity'],
    updateOpportunity: ['更新商机', 'Update Opportunity'],
    updateAccount: ['更新客户', 'Update Account'],
    updateContact: ['更新联系人', 'Update Contact'],
  };
  const [zh, en] = map[fn] ?? [fn, fn];
  return isZh ? zh : en;
}

// ---------- user-action handlers ----------

/** User saved a form-card. Caller passes the created record's id + name + any related entity context. */
export async function handleSave(
  queue: IntentQueue,
  intentId: string,
  payload: {
    recordId: string;
    recordName?: string;
    type: 'activity' | 'opportunity' | 'account' | 'contact';
    accountId?: string;
    accountName?: string;
    contactId?: string;
    contactName?: string;
    opportunityId?: string;
    opportunityName?: string;
  },
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  if (!intent) return queue;

  // Build resolvedContext patch from the just-created record so downstream
  // intents auto-fill (e.g. draftContact after draftAccount auto-injects accountId).
  const patch: Record<string, string> = {};
  if (payload.type === 'account') {
    patch.accountId = payload.recordId;
    if (payload.recordName) patch.accountName = payload.recordName;
  } else if (payload.type === 'contact') {
    patch.contactId = payload.recordId;
    if (payload.recordName) patch.contactName = payload.recordName;
    if (payload.accountId) patch.accountId = payload.accountId;
    if (payload.accountName) patch.accountName = payload.accountName;
  } else if (payload.type === 'opportunity') {
    patch.opportunityId = payload.recordId;
    if (payload.recordName) patch.opportunityName = payload.recordName;
    if (payload.accountId) patch.accountId = payload.accountId;
    if (payload.accountName) patch.accountName = payload.accountName;
  } else if (payload.type === 'activity') {
    patch.activityId = payload.recordId;
    if (payload.accountId) patch.accountId = payload.accountId;
    if (payload.accountName) patch.accountName = payload.accountName;
  }

  let q = patchIntent(queue, intentId, {
    status: 'confirmed',
    result: { recordId: payload.recordId, recordName: payload.recordName },
  });
  q = mergeResolvedContext(q, patch);

  // If this intent was a sub-intent spawned to create an entity for a parent,
  // also patch the parent's args so the parent now has the new entity's id.
  if (intent.parentId) {
    q = mergeIntentArgs(q, intent.parentId, patch);
  }

  emitResult(q, intent, 'created', payload.recordName, deps);
  q = advanceCursor(q);
  return await runQueue(q, deps);
}

/** User cancelled the current form-card / match-card. */
export async function handleCancel(
  queue: IntentQueue,
  intentId: string,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  let q = patchIntent(queue, intentId, { status: 'cancelled' });
  if (intent) emitResult(q, intent, 'cancelled', undefined, deps);
  q = advanceCursor(q);
  return await runQueue(q, deps);
}

/** User picked an existing match in the match-selection card. */
export async function handlePick(
  queue: IntentQueue,
  intentId: string,
  picked: { id: string; name: string; accountId?: string; accountName?: string },
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  if (!intent) return queue;
  const firstRes = intent.resolutions[0];
  if (!firstRes) return queue;
  const patch = buildResolvedPatch(firstRes.entityType, picked);
  let q = mergeResolvedContext(queue, patch);
  q = mergeIntentArgs(q, intentId, patch);
  q = dropFirstResolution(q, intentId);
  q = patchIntent(q, intentId, { status: 'queued' });
  // Mark the card resolved (so UI flips compact).
  if (intent.messageId) {
    const isZh = deps.locale === 'zh-Hans';
    deps.patchMessage(intent.messageId, {
      resolutionState: 'resolved',
      resolutionResult: isZh ? `已选择：${picked.name}` : `Selected: ${picked.name}`,
    });
  }
  return await runQueue(q, deps);
}

/** User chose "Create new {entity}" from a match-selection / awaiting card. */
export async function handleCreateNew(
  queue: IntentQueue,
  intentId: string,
  entityKind: 'contact' | 'account' | 'opportunity',
  queryName: string,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  if (!intent) return queue;
  const firstRes = intent.resolutions[0];

  // Spawn a sub-intent (draft{Entity}) right after cursor, then leave parent
  // queued. When sub completes, handleSave merges its id into parent's args
  // and drops the resolution.
  const subFn = entityKind === 'contact' ? 'draftContact'
    : entityKind === 'account' ? 'draftAccount'
    : 'draftOpportunity';
  const subArgs: Record<string, unknown> = entityKind === 'contact'
    ? { fullName: queryName, accountId: queue.resolvedContext.accountId, accountName: queue.resolvedContext.accountName }
    : entityKind === 'account'
      ? { name: queryName }
      : { name: queryName, accountId: queue.resolvedContext.accountId, accountName: queue.resolvedContext.accountName };

  const { queue: q1 } = insertSubIntentAfterCursor(queue, intentId, {
    function: subFn,
    arguments: subArgs,
    userFacingLabel: undefined,
    reason: `Create new ${entityKind} for parent intent`,
    resolutions: [],
  });

  // Drop the resolution from parent so once sub completes the parent can execute.
  let q = dropFirstResolution(q1, intentId);
  // Parent goes back to 'queued' so cursor walking will revisit after sub.
  q = patchIntent(q, intentId, { status: 'queued' });
  if (intent.messageId && firstRes) {
    const isZh = deps.locale === 'zh-Hans';
    deps.patchMessage(intent.messageId, {
      resolutionState: 'resolved',
      resolutionResult: isZh ? `新建：${queryName}` : `Create new: ${queryName}`,
    });
  }

  // Advance cursor to the just-inserted sub.
  q = advanceCursor(q);
  return await runQueue(q, deps);
}

/** User chose "Skip" — drop the resolution and execute parent with whatever args we have. */
export async function handleSkip(
  queue: IntentQueue,
  intentId: string,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  if (!intent) return queue;
  const firstRes = intent.resolutions[0];
  let q = dropFirstResolution(queue, intentId);
  // Strip the entity fields from the intent's args so the executor doesn't
  // try to attach an unresolved name (matches old skipResolutionAndDraftImpl).
  if (firstRes) {
    const stripKeys = firstRes.entityType === 'account' ? ['accountId', 'accountName']
      : firstRes.entityType === 'contact' ? ['contactId', 'contactName']
      : firstRes.entityType === 'opportunity' ? ['opportunityId', 'opportunityName']
      : [];
    const cleared: Record<string, unknown> = {};
    stripKeys.forEach((k) => { cleared[k] = undefined; });
    q = mergeIntentArgs(q, intentId, cleared);
  }
  q = patchIntent(q, intentId, { status: 'queued' });
  if (intent.messageId) {
    const isZh = deps.locale === 'zh-Hans';
    deps.patchMessage(intent.messageId, { resolutionState: 'resolved', resolutionResult: isZh ? '已跳过' : 'Skipped' });
  }
  return await runQueue(q, deps);
}

/** User typed a new query into "Search other" on the match card. */
export async function handleSearchOther(
  queue: IntentQueue,
  intentId: string,
  newQuery: string,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  if (!intent) return queue;
  // Mark old card resolved so it stops being interactive; the runtime will
  // emit a fresh card for the same intent with the new query.
  if (intent.messageId) {
    const isZh = deps.locale === 'zh-Hans';
    deps.patchMessage(intent.messageId, { resolutionState: 'resolved', resolutionResult: isZh ? `搜索：${newQuery}` : `Search: ${newQuery}` });
  }
  let q = replaceFirstResolutionQuery(queue, intentId, newQuery);
  q = patchIntent(q, intentId, { status: 'queued', messageId: undefined });
  return await runQueue(q, deps);
}

/**
 * User typed a free-form reply while an awaiting-clarification card is open.
 * Returns:
 *   - { handled: true, queue } if the reply was one of the known keywords
 *     (create / skip / a fresh search query).
 *   - { handled: false } if the reply doesn't look like a clarification reply
 *     (caller should treat it as a brand-new user message).
 */
export async function handleAwaitingReply(
  queue: IntentQueue,
  intentId: string,
  text: string,
  deps: RuntimeDeps,
): Promise<{ handled: true; queue: IntentQueue } | { handled: false }> {
  const intent = findIntent(queue, intentId);
  if (!intent || intent.status !== 'awaiting-user') return { handled: false };
  const firstRes = intent.resolutions[0];
  if (!firstRes) return { handled: false };

  const lc = text.trim().toLowerCase();
  const createWords = ['create', 'new', '新建', '创建', 'create new'];
  const skipWords = ['skip', '跳过', '不关联'];

  if (createWords.some((w) => lc === w || lc.startsWith(w + ' '))) {
    const kind: 'contact' | 'account' | 'opportunity' =
      firstRes.entityType === 'activity' ? 'opportunity' : firstRes.entityType;
    const q = await handleCreateNew(queue, intentId, kind, firstRes.query, deps);
    return { handled: true, queue: q };
  }
  if (skipWords.some((w) => lc === w)) {
    const q = await handleSkip(queue, intentId, deps);
    return { handled: true, queue: q };
  }
  // Any other text — treat as new search query.
  const q = await handleSearchOther(queue, intentId, text.trim(), deps);
  return { handled: true, queue: q };
}
