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
  ensureRequiredSubjectResolution,
  findIntent,
  insertSubIntentAfterCursor,
  mergeIntentArgs,
  mergeResolvedContext,
  patchIntent,
  replaceFirstResolutionQuery,
  type IntentQueue,
  type QueueIntent,
} from './intent-queue';
import { type ResolutionItem, getMatchThresholds } from './agent-utils';
import { getFunctionSubject } from './function-registry';
import { isElicitableUpdate, hasConcreteUpdateValue, updatableFields, enumOptions, fieldKind, fieldLabel } from './field-elicitation';
import { ATTACHMENT_IDS_KEY } from './attachment-assign';
import { generateProposal } from './propose-changes';
import { applyProposal, type ChangeProposal } from './change-proposal';
import { getLocale, LOCALE_META } from './i18n';
import { buildChartCard, inferChartFromRequest, type ChartSpec } from './chart-aggregation';

// ---------- card-message shapes (shared with copilot-context) ----------
// Kept loose (Record<string, unknown>) here to avoid an import cycle; the
// caller asserts the right ChatMessage type when adding to state.

export type CardMessage = Record<string, unknown> & {
  id: string;
  type: 'agent' | 'form-card' | 'match-selection' | 'awaiting-clarification' | 'param-picker' | 'proposal-card' | 'chart-card';
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
    analyzeResults: ['分析结果', 'Analyze results'],
  };
  const [zh, en] = map[intent.function] ?? [intent.function, intent.function];
  return isZh ? zh : en;
}

/** Short one-liner describing what this step will do (for the announce message). */
function describeStep(intent: QueueIntent, isZh: boolean): string {
  const args = intent.arguments;
  const title = (args.title ?? args.name ?? args.fullName ?? '') as string;
  const account = (args.accountName ?? '') as string;
  switch (intent.function) {
    case 'draftActivity':
      return isZh
        ? (title ? `记录「${title}」` : account ? `记录对${account}的拜访` : '将为你准备活动草稿')
        : (title ? `Log "${title}"` : account ? `Log visit to ${account}` : 'Prepare activity draft');
    case 'draftOpportunity':
      return isZh
        ? (title ? `新建商机「${title}」` : '将为你准备商机草稿')
        : (title ? `Create opportunity "${title}"` : 'Prepare opportunity draft');
    case 'draftContact':
      return isZh
        ? (title ? `新建联系人「${title}」` : '将为你准备联系人草稿')
        : (title ? `Create contact "${title}"` : 'Prepare contact draft');
    case 'draftAccount':
      return isZh
        ? (title ? `新建客户「${title}」` : '将为你准备客户草稿')
        : (title ? `Create account "${title}"` : 'Prepare account draft');
    default:
      return '';
  }
}

/**
 * Completion-tense copy for a finished single-step update/query.
 * Result-driven (Phase 3): instead of the generic handler message ("商机信息已更新"),
 * name the record and list the fields that actually changed ("已更新商机「X」：客户、阶段").
 * Deterministic — no LLM call on the completion path. Falls back to the handler's
 * bilingual message, then to a labelled completion.
 */
const FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  name1: { zh: '名称', en: 'name' }, title: { zh: '标题', en: 'title' },
  totalamount: { zh: '金额', en: 'amount' }, amount: { zh: '金额', en: 'amount' },
  stage: { zh: '阶段', en: 'stage' }, confidence: { zh: '信心度', en: 'confidence' },
  expectedclosedate: { zh: '预计关单日', en: 'close date' }, closedon: { zh: '关单日期', en: 'closed date' },
  lastaction: { zh: '最近动态', en: 'last action' }, account: { zh: '客户', en: 'account' },
  opportunity: { zh: '关联商机', en: 'opportunity' }, contact: { zh: '联系人', en: 'contact' },
  contacts: { zh: '参与人', en: 'attendees' }, status: { zh: '状态', en: 'status' },
  type: { zh: '类型', en: 'type' }, scheduleddate: { zh: '日期', en: 'date' },
  notes: { zh: '备注', en: 'notes' }, industrycode: { zh: '行业', en: 'industry' },
  phone: { zh: '电话', en: 'phone' }, email: { zh: '邮箱', en: 'email' }, address: { zh: '地址', en: 'address' },
};

function pickCompletionCopy(
  intent: QueueIntent,
  resData: { message?: string; updatedFields?: string[]; opportunity?: { name1?: string }; account?: { name1?: string }; contact?: { fullname?: string }; activity?: { title?: string } } | undefined,
  isZh: boolean,
): string {
  // Result-specific: name + the fields that actually changed.
  const updated = resData?.updatedFields?.filter((f) => f !== 'closedon') ?? [];
  const recordName =
    resData?.opportunity?.name1 ?? resData?.account?.name1 ??
    resData?.contact?.fullname ?? resData?.activity?.title ??
    (intent.arguments.opportunityName ?? intent.arguments.accountName ??
     intent.arguments.contactName ?? intent.arguments.title) as string | undefined;
  if (intent.function.startsWith('update') && updated.length > 0) {
    const labels = updated.map((f) => (isZh ? FIELD_LABELS[f]?.zh : FIELD_LABELS[f]?.en) ?? f);
    const fieldList = labels.join(isZh ? '、' : ', ');
    const what = recordName ? (isZh ? `「${recordName}」` : ` "${recordName}"`) : '';
    return isZh
      ? `已更新${what}：${fieldList}。`
      : `Updated${what}: ${fieldList}.`;
  }
  // Handler messages are bilingual "中文 / English" — take the matching half.
  const raw = resData?.message;
  if (raw && raw.includes(' / ')) {
    const [zh, en] = raw.split(' / ');
    return (isZh ? zh : en).trim();
  }
  if (raw) return raw;
  const label = labelFor(intent, isZh);
  return isZh ? `${label}已完成。` : `${label} done.`;
}

function emitAnnounce(queue: IntentQueue, intent: QueueIntent, deps: RuntimeDeps): IntentQueue {
  if (intent.announced || intent.parentId) return queue;
  const { idx, total } = stepPosition(queue, intent);
  // Single-step queues skip narration — the ack + card carry enough context.
  if (total <= 1) return patchIntent(queue, intent.id, { announced: true });
  const isZh = deps.locale === 'zh-Hans';
  const label = labelFor(intent, isZh);
  const desc = describeStep(intent, isZh);
  const content = isZh
    ? `正在处理第 ${idx} / ${total} 步：${label}${desc ? ` — ${desc}` : ''}`
    : `Step ${idx} of ${total}: ${label}${desc ? ' — ' + desc : ''}`;
  const announceId = `announce-${queue.id}-${intent.id}`;
  deps.pushMessage({
    id: announceId,
    type: 'agent',
    content,
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    taskRole: 'announce',
    taskAnnounce: { index: idx, total, label: `${label}${desc ? ' — ' + desc : ''}` },
  });
  return patchIntent(queue, intent.id, { announced: true });
}

type ResultAction = 'created' | 'updated' | 'cancelled' | 'failed' | 'completed';

/**
 * Per-step result narration is intentionally suppressed — the card's own
 * Saved / Cancelled badge already communicates the outcome clearly.
 * The final summary covers all steps in aggregate.
 */
function emitResult(
  _queue: IntentQueue,
  _intent: QueueIntent,
  _action: ResultAction,
  _recordName: string | undefined,
  _deps: RuntimeDeps,
): void {
  // no-op: card state is sufficient
}

async function emitSummary(queue: IntentQueue, deps: RuntimeDeps): Promise<IntentQueue> {
  if (queue.summaryEmitted) return queue;
  const top = topLevelIntents(queue);
  if (top.length <= 1) return { ...queue, summaryEmitted: true };
  const isZh = deps.locale === 'zh-Hans';

  // ---- Check if all steps are non-draft functions → aggregate with LLM ----
  const allNonDraft = top.every((i) => !i.function.startsWith('draft'));
  
  if (allNonDraft && top.some((i) => i.status === 'confirmed')) {
    // Collect all query results for LLM aggregation
    const stepSummaries = top.map((intent, idx) => {
      const label = intent.userFacingLabel || intent.function;
      const result = intent.result as { data?: unknown; count?: number } | undefined;
      const data = result?.data;
      const dataStr = data ? JSON.stringify(data, null, 0).slice(0, 2000) : 'no data';
      return `Step ${idx + 1} (${label}): ${result?.count ?? 0} records\nData: ${dataStr}`;
    }).join('\n\n');

    // Get the original user message from the queue
    const userMsg = queue.userMessage || '';

    // Show a thinking indicator while the LLM generates the summary
    const summaryMsgId = `narrate-${queue.id}-summary-${Date.now()}`;
    deps.pushMessage({
      id: summaryMsgId,
      type: 'agent',
      content: '',
      timestamp: Date.now(),
      queueId: queue.id,
      queueIntentId: 'summary',
      taskRole: 'summary',
      isThinking: true,
      thinkingSteps: [{
        stage: 'generating',
        status: 'active',
        label: isZh ? '正在生成综合分析...' : 'Generating summary...',
      }],
    });

    try {
      const dagResult = await executeFunction('summarizeDAGResults', {
        data: `Original request: ${userMsg}\n\n${stepSummaries}`,
      }, { locale: deps.locale });

      if (dagResult.success && dagResult.data) {
        deps.patchMessage(summaryMsgId, {
          content: dagResult.data as string,
          isThinking: false,
          thinkingSteps: [{
            stage: 'generating',
            status: 'completed',
            label: isZh ? '已完成' : 'Done',
          }],
        });
        return { ...queue, summaryEmitted: true };
      }
    } catch (e) {
      console.error('[QueueRuntime] Aggregation LLM failed:', e);
    }
    // LLM failed — replace thinking with fallback summary
    deps.patchMessage(summaryMsgId, {
      isThinking: false,
      thinkingSteps: undefined,
    });
  }

  // ---- Default summary for draft/create workflows ----
  const done = top.filter((i) => i.status === 'confirmed');
  const skipped = top.filter((i) => i.status === 'cancelled' || i.status === 'skipped');
  const failed = top.filter((i) => i.status === 'failed');

  const parts: string[] = [];

  // Headline
  if (done.length === top.length) {
    parts.push(isZh ? `✅ 全部 ${top.length} 项已完成。` : `✅ All ${top.length} items done.`);
  } else {
    const counts: string[] = [];
    if (done.length) counts.push(isZh ? `${done.length} 项已完成` : `${done.length} completed`);
    if (skipped.length) counts.push(isZh ? `${skipped.length} 项跳过` : `${skipped.length} skipped`);
    if (failed.length) counts.push(isZh ? `${failed.length} 项失败` : `${failed.length} failed`);
    parts.push(counts.join(isZh ? '，' : ', ') + '。');
  }

  // "What was recorded" — bullet list with key details from intent arguments
  // Only include items that have a meaningful title (created records, not queries)
  if (done.length > 0) {
    const bullets = done.map((i) => {
      const a = i.arguments;
      const title = (a.title ?? a.name ?? a.fullName ?? i.result?.recordName ?? '') as string;
      if (!title) return null;
      const account = (a.accountName ?? queue.resolvedContext.accountName ?? '') as string;
      const date = (a.scheduledStart ?? a.scheduledDate ?? '') as string;
      const contact = (a.contactName ?? '') as string;
      let detail = title;
      const extras: string[] = [];
      if (date) extras.push(date);
      if (account && !title.toLowerCase().includes(account.toLowerCase())) extras.push(account);
      if (contact && !title.toLowerCase().includes(contact.toLowerCase())) extras.push(contact);
      if (extras.length) detail += ` (${extras.join(' · ')})`;
      return `• ${detail}`;
    }).filter((b): b is string => b !== null);
    if (bullets.length > 0) {
      parts.push(isZh ? '已记录：' : 'Recorded:');
      parts.push(...bullets);
    }
  }

  // "Skipped items" — brief note so salesperson knows what wasn't done
  if (skipped.length > 0) {
    const items = skipped.map((i) => {
      const title = (i.arguments.title ?? i.arguments.name ?? labelFor(i, isZh)) as string;
      return title;
    });
    parts.push(isZh
      ? `⚠️ 未创建：${items.join('、')}。如需跟进请手动操作。`
      : `⚠️ Skipped: ${items.join(', ')}. Create manually if needed.`);
  }

  if (failed.length > 0) {
    parts.push(isZh ? `❌ ${failed.length} 项执行失败，请稍后重试。` : `❌ ${failed.length} item(s) failed — retry later.`);
  }

  deps.pushMessage({
    id: `narrate-${queue.id}-summary-${Date.now()}`,
    type: 'agent',
    content: parts.join('\n'),
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
      q = await emitSummary(q, deps);
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

  // 1) Resolve every pending resolution serially (name→id matches, etc.).
  {
    const r = await drainResolutions(q, deps);
    q = r.q;
    if (r.awaiting) return q;
  }
  cur = currentIntent(q)!;

  // 2) Implicit per-step fuzzy-match for additional-intent name fields
  //    (parity with old processAdditionalIntents behaviour for draftActivity / Opp / Contact
  //    that have accountName / contactName / opportunityName but no id).
  q = await implicitNameResolution(q, cur, deps);
  cur = currentIntent(q)!;

  // 2.5) Missing-subject gate: action tools (updateOpportunity, …) declare a
  //      required subject entity. If it can't be resolved from args/context,
  //      append a required resolution so the user picks/searches the record via
  //      the existing match-selection card — instead of hard-failing in the
  //      handler. buildEffectiveArgs already folded in page/context ids, so this
  //      fires ONLY when the subject is genuinely unknown.
  q = ensureRequiredSubjectResolution(q, cur);
  {
    const r = await drainResolutions(q, deps);
    q = r.q;
    if (r.awaiting) return q;
  }
  cur = currentIntent(q)!;

  // 2.6) Missing-parameter gate: an update tool whose subject is resolved but
  //      which carries no concrete value elicits the field/value via chips
  //      (enum) or an input (scalar) instead of hard-failing in the handler.
  {
    const r = await ensureRequiredParams(q, cur, deps);
    q = r.q;
    if (r.awaiting) return q;
  }
  cur = currentIntent(q)!;

  // 3) Execute the function.
  return await executeIntent(q, cur, deps);
}

/** Subject entity's display name (for the param-picker title). */
function subjectLabelFor(intent: QueueIntent, queue: IntentQueue): string | undefined {
  const subj = getFunctionSubject(intent.function);
  if (!subj) return undefined;
  const args = buildEffectiveArgs(intent, queue.resolvedContext);
  const name = args[`${subj}Name`];
  return typeof name === 'string' && name ? name : undefined;
}

/**
 * Missing-parameter gate. When an elicitable update tool has a resolved subject
 * but no concrete value, render a param-picker card (chooseField) and pause so
 * the user selects what to change — instead of the handler hard-failing.
 */
async function ensureRequiredParams(
  queue: IntentQueue,
  intent: QueueIntent,
  deps: RuntimeDeps,
): Promise<{ q: IntentQueue; awaiting: boolean }> {
  const fn = intent.function;
  if (!isElicitableUpdate(fn)) return { q: queue, awaiting: false };
  const args = buildEffectiveArgs(intent, queue.resolvedContext);
  if (hasConcreteUpdateValue(fn, args)) return { q: queue, awaiting: false };
  const fields = updatableFields(fn, deps.locale);
  if (fields.length === 0) return { q: queue, awaiting: false };

  const isZh = deps.locale === 'zh-Hans';
  const messageId = `card-${queue.id}-${intent.id}-param-${Date.now()}`;
  deps.pushMessage({
    id: messageId,
    type: 'param-picker',
    content: isZh ? '请选择要修改的内容' : 'Choose what to change',
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    paramPicker: {
      function: fn,
      arguments: args,
      subjectLabel: subjectLabelFor(intent, queue),
      mode: 'chooseField',
      options: fields.map((f) => ({ value: f.name, label: f.label })),
    },
  });
  return { q: patchIntent(queue, intent.id, { status: 'awaiting-user', messageId }), awaiting: true };
}

/**
 * Resolve the current intent's pending resolutions serially. Returns the updated
 * queue and whether it stopped because a card is awaiting user input.
 */
async function drainResolutions(
  queue: IntentQueue,
  deps: RuntimeDeps,
): Promise<{ q: IntentQueue; awaiting: boolean }> {
  let q = queue;
  let cur = currentIntent(q);
  while (cur && cur.resolutions.length > 0) {
    q = await runOneResolution(q, cur, cur.resolutions[0], deps);
    cur = currentIntent(q);
    if (!cur) return { q, awaiting: false };
    if (cur.status === 'awaiting-user') return { q, awaiting: true };
  }
  return { q, awaiting: false };
}

/**
 * Resolve one ResolutionItem at the head of the current intent's queue.
 * Returns the updated queue. Inspect the head intent's status afterward:
 *   - status === 'awaiting-user' → card rendered, caller should stop.
 *   - resolutions length decreased → auto-resolved, caller may loop.
 *   - else (no high-conf, non-draft, non-required) → resolution silently dropped.
 */
async function runOneResolution(
  queue: IntentQueue,
  intent: QueueIntent,
  resolution: ResolutionItem,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const { entityType, query, scopeBy } = resolution;

  // Activity duplicate-check is not useful for sales workflows — reps frequently
  // visit the same account/topic. Skip it silently (unless it's a required subject).
  if (entityType === 'activity' && !resolution.required) {
    return dropFirstResolution(queue, intent.id);
  }

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
      // A required subject can't be silently dropped — surface a picker/prompt.
      if (resolution.required) {
        return renderAwaitingClarificationCard(queue, intent, resolution, { matches: [] }, deps);
      }
      return dropFirstResolution(queue, intent.id);
    }

    const data = matchRes.data as {
      matches: Array<{ id: string; name: string; score: number; matchType: string; accountId?: string; accountName?: string }>;
      confidence: 'high' | 'medium' | 'low' | 'none';
      exactMatch?: { id: string; name: string; score: number; accountId?: string; accountName?: string };
      listMode?: boolean;
    };

    const highConf = data.matches.filter((m) => m.score >= getMatchThresholds().high);

    // Auto-resolve when there's a single unambiguous option:
    //   - a single high-confidence fuzzy match (name query), or
    //   - a required subject whose pick-list has exactly one candidate
    //     ("update the opportunity" and only one opportunity exists).
    const singleAuto =
      (highConf.length === 1 && highConf[0].score > 90) ||
      (resolution.required === true && data.listMode === true && data.matches.length === 1);

    if (singleAuto) {
      const top = resolution.required && data.listMode && data.matches.length === 1 ? data.matches[0] : highConf[0];
      const ctx = buildResolvedPatch(entityType, top);
      let next = mergeResolvedContext(queue, ctx);
      next = mergeIntentArgs(next, intent.id, ctx);
      next = dropFirstResolution(next, intent.id);
      console.log('[IntentQueueRuntime] auto-resolved', entityType, '→', top.name);
      return next;
    }

    // Required subject (missing-id gate): the user MUST choose. Render the picker
    // whenever there is any candidate (list mode or low-conf name match); never
    // silently drop — that is what used to make "update the opportunity" fail.
    if (resolution.required) {
      if (data.matches.length > 0) {
        return renderMatchSelectionCard(queue, intent, resolution, data, deps);
      }
      return renderAwaitingClarificationCard(queue, intent, resolution, data, deps);
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
    if (resolution.required) {
      return renderAwaitingClarificationCard(queue, intent, resolution, { matches: [] }, deps);
    }
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
  // Order: opportunity → contact → account.
  // Selecting an opportunity often provides the account; selecting a contact
  // provides the account too. This minimises redundant user selections.
  const lookups: Lookup[] = [];
  if (intent.function === 'draftActivity') {
    lookups.push({ name: 'opportunityName', idField: 'opportunityId', entityType: 'opportunity' });
    lookups.push({ name: 'contactName', idField: 'contactId', entityType: 'contact' });
  }
  lookups.push({ name: 'accountName', idField: 'accountId', entityType: 'account' });

  let q = queue;
  for (const lk of lookups) {
    const nameVal = args[lk.name];
    const idVal = args[lk.idField];
    if (typeof nameVal !== 'string' || !nameVal.trim()) continue;
    if (typeof idVal === 'string' && idVal) continue;
    // Use the entity-specific fuzzy-match function (fuzzyMatchAccount, etc.)
    const fnName =
      lk.entityType === 'account' ? 'fuzzyMatchAccount'
      : lk.entityType === 'contact' ? 'fuzzyMatchContact'
      : 'fuzzyMatchOpportunity';
    try {
      const res = await executeFunction(
        fnName,
        { query: nameVal.trim() },
        { userId: deps.userId, userEmail: deps.userEmail },
      );
      if (!res.success || !res.data) continue;
      const md = res.data as { matches?: Array<{ id: string; name: string; score: number; accountId?: string; accountName?: string }> };
      const top = (md.matches ?? []).find((m) => m.score >= getMatchThresholds().autoSelect);
      if (!top) continue;
      const patch: Record<string, string> = { [lk.idField]: top.id, [lk.name]: top.name };
      // Propagate parent entity context from the match result so downstream
      // lookups can skip (e.g. resolving opportunity gives us accountId).
      if ((lk.entityType === 'contact' || lk.entityType === 'opportunity') && top.accountId && !args.accountId) {
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
    const out: Record<string, string> = { opportunityId: m.id, opportunityName: m.name };
    if (m.accountId) out.accountId = m.accountId;
    if (m.accountName) out.accountName = m.accountName;
    return out;
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
    listMode?: boolean;
  },
  deps: RuntimeDeps,
): IntentQueue {
  const isZh = deps.locale === 'zh-Hans';
  const isListMode = data.listMode === true;
  const highConf = data.matches.filter((m) => m.score >= getMatchThresholds().high);
  const lowConf = data.matches.filter((m) => m.score < getMatchThresholds().high && m.score >= 20);
  const messageId = `card-${queue.id}-${intent.id}-match-${Date.now()}`;
  const entityZh = resolution.entityType === 'account' ? '客户'
    : resolution.entityType === 'contact' ? '联系人'
    : resolution.entityType === 'activity' ? '活动'
    : '商机';
  // List mode (missing-subject picker): show ALL candidates, no confidence tiers.
  const primaryMatches = isListMode ? data.matches : highConf;
  const secondaryMatches = isListMode ? [] : lowConf;

  deps.pushMessage({
    id: messageId,
    type: 'match-selection',
    content: isListMode
      ? (isZh ? `请选择要操作的${entityZh}：` : `Select a ${resolution.entityType}:`)
      : (isZh
        ? `找到 ${highConf.length} 个${entityZh}匹配，请选择一个：`
        : `Found ${highConf.length} matching ${resolution.entityType}(s). Please pick one:`),
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    matchSelection: {
      entityType: resolution.entityType,
      query: resolution.query,
      matches: primaryMatches,
      lowConfidenceMatches: secondaryMatches,
      listMode: isListMode,
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

  // proposeChanges = the "想一下 / think" step: reason over prior records → a
  // change proposal rendered as a confirm card. Nothing is written until the
  // user confirms (per confirm-scope A: composite/destructive ops are gated).
  if (intent.function === 'proposeChanges') {
    return await renderProposalCard(queue, intent, deps);
  }

  // analyzeResults = read-only "想一下 / think" step: reason over the records a
  // prior query step fetched → a grounded answer. Nothing is written.
  if (intent.function === 'analyzeResults') {
    return await renderAnalysis(queue, intent, deps);
  }

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
      // Patch the announce message with error detail instead of pushing a separate message
      const announceId = `announce-${queue.id}-${intent.id}`;
      deps.patchMessage(announceId, {
        announceDetail: isZh ? `失败: ${err}` : `Failed: ${err}`,
        announceStatus: 'failed',
      });
      emitResult(queue, intent, 'failed', undefined, deps);
      let q = patchIntent(queue, intent.id, { status: 'failed', result: { error: err } });
      q = advanceCursor(q);
      return await runQueue(q, deps);
    }

    if (res.invalidateQueries) deps.invalidate(res.invalidateQueries);

    // Step position determines HOW the completion is surfaced:
    //  - multi-step  → patch the existing announce row (narration bar) + final emitSummary
    //  - single-step → there is NO announce message (emitAnnounce skips total<=1),
    //                  so patching it is a no-op and the completion VANISHES (this was
    //                  the "stuck on updating…" bug). Push a real completion message.
    const { total } = stepPosition(queue, intent);
    const isSingleStep = total <= 1;

    if (isSingleStep) {
      // Phase 1b (interim): emit a completion-tense message for single-step
      // update/query so the turn ends on a result, not a dangling "updating…".
      // Phase 3: replace this templated copy with an LLM-generated summary that
      // describes WHAT changed (e.g. "已将商机X的客户更新为Y") from res.data.
      const resData = res.data as { message?: string; updatedFields?: string[] } | undefined;
      const completion = pickCompletionCopy(intent, resData, isZh);
      deps.pushMessage({
        id: `complete-${queue.id}-${intent.id}-${Date.now()}`,
        type: 'agent',
        content: completion,
        timestamp: Date.now(),
        queueId: queue.id,
        queueIntentId: intent.id,
      });
    } else if (intent.function.startsWith('update')) {
      // For update*: patch announce with result.
      const updateAnnounceId = `announce-${queue.id}-${intent.id}`;
      deps.patchMessage(updateAnnounceId, {
        announceDetail: isZh ? '已更新' : 'Updated',
        announceStatus: 'completed',
      });
      emitResult(queue, intent, 'updated', undefined, deps);
    } else {
      // query* / other — merge result into announce detail
      const count = Array.isArray(res.data) ? res.data.length : 1;
      const announceId = `announce-${queue.id}-${intent.id}`;
      deps.patchMessage(announceId, {
        announceDetail: isZh ? `${count} 条记录` : `${count} record${count === 1 ? '' : 's'}`,
        announceStatus: 'completed',
      });
      emitResult(queue, intent, 'completed', undefined, deps);
    }

    let q = patchIntent(queue, intent.id, { status: 'confirmed', result: { data: res.data, count: Array.isArray(res.data) ? res.data.length : 1 } });
    q = advanceCursor(q);
    return await runQueue(q, deps);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const catchAnnounceId = `announce-${queue.id}-${intent.id}`;
    deps.patchMessage(catchAnnounceId, {
      announceDetail: isZh ? `失败` : `Failed`,
      announceStatus: 'failed',
    });
    emitResult(queue, intent, 'failed', undefined, deps);
    let q = patchIntent(queue, intent.id, { status: 'failed', result: { error: msg } });
    q = advanceCursor(q);
    return await runQueue(q, deps);
  }
}

/** Dump every prior step's result records (as JSON text) so the reason step can
 *  see the concrete records — including their ids — to propose changes over.
 *  Mirrors the text channel emitSummary uses for summarizeDAGResults. */
function collectPriorRecordsText(queue: IntentQueue, upto: QueueIntent): string {
  const idx = queue.intents.findIndex((i) => i.id === upto.id);
  const end = idx < 0 ? queue.intents.length : idx;
  const chunks: string[] = [];
  for (let i = 0; i < end; i++) {
    const data = (queue.intents[i].result as { data?: unknown } | undefined)?.data;
    if (data != null) chunks.push(JSON.stringify(data, null, 0).slice(0, 4000));
  }
  return chunks.join('\n\n');
}

/** Structured companion to collectPriorRecordsText: the flattened record objects
 *  from prior steps' results, used to build grounded chart segments. */
function collectPriorRecords(queue: IntentQueue, upto: QueueIntent): unknown[] {
  const idx = queue.intents.findIndex((i) => i.id === upto.id);
  const end = idx < 0 ? queue.intents.length : idx;
  const out: unknown[] = [];
  for (let i = 0; i < end; i++) {
    const data = (queue.intents[i].result as { data?: unknown } | undefined)?.data;
    if (Array.isArray(data)) out.push(...data);
    else if (data != null) out.push(data);
  }
  return out;
}

/** When a chart accompanies the answer, its tap-to-drill-down already presents the
 *  per-group breakdown — so strip enumerated lists / headings from the answer and
 *  keep only the insight prose, preventing a text wall that duplicates the chart. */
function stripBreakdownProse(md: string): string {
  const lines = md.split('\n');
  const kept = lines.filter((ln) => {
    const t = ln.trim();
    if (!t) return false;
    if (/^#{1,6}\s/.test(t)) return false;   // headings
    if (/^[-*+]\s/.test(t)) return false;    // bullet items
    if (/^\d+[.)]\s/.test(t)) return false;  // numbered items
    if (/^>\s/.test(t)) return false;        // block quotes
    return true;
  });
  let out = kept.join('\n\n').trim();
  if (out.length < 20) {
    // The whole answer was a list — keep the first line's plain text as the takeaway.
    const first = lines.map((l) => l.replace(/^[#>\-*+\d.)\s]+/, '').trim()).find((l) => l.length > 0);
    out = first || md.trim();
  }
  return out;
}

/** proposeChanges step: reason over prior records → render a confirm card (or end
 *  gracefully when there is nothing to change). No write happens here. */
async function renderProposalCard(
  queue: IntentQueue,
  intent: QueueIntent,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const isZh = deps.locale === 'zh-Hans';
  const effectiveArgs = buildEffectiveArgs(intent, queue.resolvedContext);
  const goal = (typeof effectiveArgs.goal === 'string' && effectiveArgs.goal.trim())
    ? (effectiveArgs.goal as string)
    : (queue.userMessage || '');
  const recordsText = collectPriorRecordsText(queue, intent);
  const announceId = `announce-${queue.id}-${intent.id}`;

  let outcome: Awaited<ReturnType<typeof generateProposal>>;
  try {
    outcome = await generateProposal({ goal, recordsText, language: LOCALE_META[getLocale()].englishName });
  } catch (e) {
    outcome = { proposal: null, error: e instanceof Error ? e.message : String(e) };
  }

  // No usable proposal, or the model judged there is nothing to change.
  if (!outcome.proposal || outcome.proposal.writes.length === 0) {
    const msg = outcome.proposal
      ? (outcome.proposal.summary || (isZh ? '没有需要合并/修改的内容。' : 'Nothing to merge or change.'))
      : (isZh ? '我没能形成一个可执行的修改方案。' : "I couldn't form an actionable change.");
    deps.patchMessage(announceId, { announceDetail: isZh ? '无改动' : 'No change', announceStatus: 'completed' });
    deps.pushMessage({
      id: `complete-${queue.id}-${intent.id}-${Date.now()}`,
      type: 'agent', content: msg, timestamp: Date.now(), queueId: queue.id, queueIntentId: intent.id,
    });
    let q = patchIntent(queue, intent.id, { status: 'confirmed', result: { data: null, count: 0 } });
    q = advanceCursor(q);
    return await runQueue(q, deps);
  }

  // Render the confirm card and wait for Confirm / Cancel.
  const messageId = `card-${queue.id}-${intent.id}-proposal-${Date.now()}`;
  deps.pushMessage({
    id: messageId,
    type: 'proposal-card',
    content: '',
    timestamp: Date.now(),
    queueId: queue.id,
    queueIntentId: intent.id,
    proposalCard: { proposal: outcome.proposal, status: 'pending' },
  });
  return patchIntent(queue, intent.id, { status: 'executing', messageId });
}

/** analyzeResults step: the read/analysis "想一下". It reasons over the records
 *  prior query steps fetched and EITHER emits a grounded answer, OR (observe→
 *  decide) asks for ONE more grounded query when the current records cannot
 *  answer — in which case we spawn that query + a re-analysis, bounded by a hop
 *  budget to prevent loops. Read-only; no write, no card. */
async function renderAnalysis(
  queue: IntentQueue,
  intent: QueueIntent,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const isZh = deps.locale === 'zh-Hans';
  const effectiveArgs = buildEffectiveArgs(intent, queue.resolvedContext);
  const goal = (typeof effectiveArgs.goal === 'string' && effectiveArgs.goal.trim())
    ? (effectiveArgs.goal as string)
    : (queue.userMessage || '');
  const hop = typeof effectiveArgs._hop === 'number' ? (effectiveArgs._hop as number) : 0;
  const recordsText = collectPriorRecordsText(queue, intent);
  const announceId = `announce-${queue.id}-${intent.id}`;
  const MAX_HOPS = 1;
  const finalHop = hop >= MAX_HOPS;
  const QUERY_FNS = new Set(['queryAccounts', 'queryOpportunities', 'queryActivities', 'queryContacts']);

  type AnalyzeOut = { answer?: string; followupQuery?: { function?: string; arguments?: Record<string, unknown>; reason?: string }; chart?: { type?: 'bar' | 'donut' | 'line'; dimension?: string; metric?: 'amount' | 'count'; title?: string } };
  let parsed: AnalyzeOut | null = null;
  if (recordsText.trim()) {
    try {
      const res = await executeFunction(
        'analyzeResults',
        { data: `User request: ${goal}\n\nFetched records (JSON):\n${recordsText}${finalHop ? '\n\n(Final step: you MUST return an {"answer"} grounded in the records above now — do NOT request a follow-up.)' : ''}` },
        { locale: deps.locale },
      );
      if (res.success && res.data && typeof res.data === 'object') {
        parsed = res.data as AnalyzeOut;
      }
    } catch (e) {
      console.error('[QueueRuntime] analyzeResults failed:', e);
    }
  }

  // observe→decide: the think step may request ONE more grounded query when the
  // fetched records cannot answer. Bounded by MAX_HOPS so it can never loop.
  const fu = parsed?.followupQuery;
  const wantsFollowup = !!fu
    && typeof fu.function === 'string'
    && QUERY_FNS.has(fu.function)
    && hop < MAX_HOPS
    && !(parsed?.answer && parsed.answer.trim());
  if (wantsFollowup && fu) {
    deps.patchMessage(announceId, {
      announceDetail: isZh ? '需要补充数据' : 'Fetching more',
      announceStatus: 'completed',
    });
    let q = patchIntent(queue, intent.id, { status: 'confirmed', result: { data: null, count: 0 } });
    // Insert re-analysis FIRST, then the follow-up query, both after the cursor.
    // insertSubIntentAfterCursor puts each at cursor+1, so the net order becomes
    // [ follow-up query, re-analysis ] — query runs, then analysis re-reads the
    // combined records. Re-analysis carries hop+1 to bound the loop.
    ({ queue: q } = insertSubIntentAfterCursor(q, intent.id, {
      function: 'analyzeResults',
      arguments: { _hop: hop + 1, goal },
      userFacingLabel: { zh: '分析结果', en: 'Analyze results' },
      resolutions: [],
    }));
    ({ queue: q } = insertSubIntentAfterCursor(q, intent.id, {
      function: fu.function as string,
      arguments: { ...(fu.arguments || {}) },
      reason: fu.reason,
      userFacingLabel: { zh: '补充查询', en: 'Follow-up query' },
      resolutions: [],
    }));
    q = advanceCursor(q);
    return await runQueue(q, deps);
  }

  let answer = (parsed?.answer && parsed.answer.trim())
    ? parsed.answer.trim()
    : (isZh ? '没有可供分析的数据。' : 'No data available to analyze.');

  // Decide the chart BEFORE emitting the answer: the agent MAY emit an explicit
  // chart spec; if it doesn't, infer one from the user's own phrasing ("by account",
  // "by month", ...) or fall back to the stage pipeline for a general opportunity
  // breakdown. buildChartCard grounds it against the real records (null when nothing
  // is chartable).
  const c = parsed?.chart;
  let spec: ChartSpec | null = null;
  if (c?.type && c.dimension && c.metric) {
    spec = {
      type: c.type === 'donut' ? 'donut' : c.type === 'line' ? 'line' : 'bar',
      dimension: c.dimension,
      metric: c.metric === 'amount' ? 'amount' : 'count',
      title: c.title,
    };
  } else {
    spec = inferChartFromRequest(goal);
    if (!spec && /pipeline|overview|break ?down|distribut|summary|analy|管道|概览|概覽|分布|阶段|階段|分析/i.test(goal)) {
      spec = { type: 'bar', dimension: 'stage', metric: 'amount' };
    }
  }
  const card = spec ? buildChartCard(collectPriorRecords(queue, intent), spec, isZh ? 'zh-Hans' : 'en') : null;
  // With a chart, keep the text to insight only — the chart + drill-down already
  // show every group and record, so drop any enumerated list the model still wrote.
  if (card) answer = stripBreakdownProse(answer);

  deps.patchMessage(announceId, { announceDetail: isZh ? '已分析' : 'Analyzed', announceStatus: 'completed' });
  deps.pushMessage({
    id: `complete-${queue.id}-${intent.id}-${Date.now()}`,
    type: 'agent', content: answer, timestamp: Date.now(), queueId: queue.id, queueIntentId: intent.id,
  });
  if (card) {
    deps.pushMessage({
      id: `chart-${queue.id}-${intent.id}-${Date.now()}`,
      type: 'chart-card',
      content: '',
      timestamp: Date.now(),
      queueId: queue.id,
      queueIntentId: intent.id,
      chartCard: card,
    });
  }
  let q = patchIntent(queue, intent.id, { status: 'confirmed', result: { data: null, count: 0 } });
  q = advanceCursor(q);
  // This step IS the final answer for the read intent — suppress the generic
  // multi-step aggregate summary so the turn does not double-answer.
  q = { ...q, summaryEmitted: true };
  return await runQueue(q, deps);
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
      const draftAnnounceId = `announce-${queue.id}-${intent.id}`;
      deps.patchMessage(draftAnnounceId, {
        announceDetail: isZh ? `失败: ${err}` : `Failed: ${err}`,
        announceStatus: 'failed',
      });
      let q = patchIntent(queue, intent.id, { status: 'failed', result: { error: err } });
      q = advanceCursor(q);
      return await runQueue(q, deps);
    }
    const draftData = res.data as { type: 'activity' | 'opportunity' | 'account' | 'contact'; isNew?: boolean; data: Record<string, unknown> };
    const messageId = `card-${queue.id}-${intent.id}-form-${Date.now()}`;
    const attachmentIds = effectiveArgs[ATTACHMENT_IDS_KEY] as string[] | undefined;
    deps.pushMessage({
      id: messageId,
      type: 'form-card',
      content: '',
      timestamp: Date.now(),
      queueId: queue.id,
      queueIntentId: intent.id,
      formCard: {
        type: draftData.type,
        isNew: draftData.isNew ?? true,
        data: draftData.data,
        status: 'pending',
        ...(attachmentIds?.length ? { attachmentIds } : {}),
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

  // A sub-intent spawned to create an entity for a parent must hand control BACK
  // to that parent (it sits BEHIND the cursor and is 'queued'). advanceCursor only
  // scans forward, so advancing here would skip the parent — the parent activity/
  // opportunity would be silently forgotten (the "created account but never made
  // the activity" bug). Point the cursor at the parent so it executes next.
  if (intent.parentId) {
    const parentIdx = q.intents.findIndex((i) => i.id === intent.parentId);
    if (parentIdx >= 0 && q.intents[parentIdx].status === 'queued') {
      return await runQueue({ ...q, cursor: parentIdx }, deps);
    }
  }
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
  if (intent) {
    emitResult(q, intent, 'cancelled', undefined, deps);
    // Unlock the card message so the composer is no longer blocked. Match /
    // awaiting cards gate on resolutionState; form cards gate on formCard.status
    // (set separately by the card), so patching resolutionState is safe for both.
    if (intent.messageId) {
      const isZh = deps.locale === 'zh-Hans';
      deps.patchMessage(intent.messageId, { resolutionState: 'resolved', resolutionResult: isZh ? '已取消' : 'Cancelled' });
    }
  }
  q = advanceCursor(q);
  return await runQueue(q, deps);
}

/** User confirmed a change proposal → apply its writes (update/delete) in order,
 *  then advance. This is the ONLY path that runs a proposal's destructive writes. */
export async function handleProposalConfirm(
  queue: IntentQueue,
  intentId: string,
  proposal: ChangeProposal,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const isZh = deps.locale === 'zh-Hans';
  const intent = findIntent(queue, intentId);
  const exec = (fn: string, args: Record<string, unknown>) =>
    executeFunction(fn, args, { userId: deps.userId, userEmail: deps.userEmail, locale: deps.locale })
      .then((r) => ({ success: r.success, error: r.error }));
  const res = await applyProposal(proposal, exec);

  // Writes touched activities (and possibly their accounts).
  deps.invalidate(['activity-list', 'account-list']);

  if (intent?.messageId) {
    deps.patchMessage(intent.messageId, {
      proposalCard: { proposal, status: res.ok ? 'applied' : 'failed' },
      resolutionState: 'resolved',
      resolutionResult: res.ok ? (isZh ? '已应用' : 'Applied') : (isZh ? '部分失败' : 'Partly failed'),
    });
  }

  const doneMsg = res.ok
    ? (isZh ? `已完成：${proposal.summary || '修改已应用'}` : `Done: ${proposal.summary || 'changes applied'}`)
    : (isZh ? `应用中断：完成 ${res.done}/${res.total} 项（${res.error ?? ''}）` : `Stopped: applied ${res.done}/${res.total} (${res.error ?? ''})`);
  deps.pushMessage({
    id: `complete-${queue.id}-${intentId}-${Date.now()}`,
    type: 'agent', content: doneMsg, timestamp: Date.now(), queueId: queue.id, queueIntentId: intentId,
  });
  deps.toast(res.ok ? 'success' : 'error', doneMsg);

  let q = patchIntent(queue, intentId, { status: res.ok ? 'confirmed' : 'failed', result: { data: proposal, count: res.done } });
  q = advanceCursor(q);
  return await runQueue(q, deps);
}

/** User picked WHICH field to change on a param-picker card (chooseField → chooseValue). */
export async function handleParamFieldPick(
  queue: IntentQueue,
  intentId: string,
  field: string,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  if (!intent || !intent.messageId) return queue;
  const fn = intent.function;
  const kind = fieldKind(fn, field);
  deps.patchMessage(intent.messageId, {
    paramPicker: {
      function: fn,
      arguments: buildEffectiveArgs(intent, queue.resolvedContext),
      subjectLabel: subjectLabelFor(intent, queue),
      mode: 'chooseValue',
      field,
      fieldLabel: fieldLabel(field, deps.locale),
      fieldKind: kind,
      options: kind === 'enum' ? enumOptions(fn, field, deps.locale) : [],
    },
  });
  return queue; // still awaiting-user; the value step resumes the queue
}

/** User chose the new VALUE on a param-picker card → inject into args + resume. */
export async function handleParamValuePick(
  queue: IntentQueue,
  intentId: string,
  field: string,
  rawValue: string,
  deps: RuntimeDeps,
): Promise<IntentQueue> {
  const intent = findIntent(queue, intentId);
  if (!intent) return queue;
  const fn = intent.function;
  const kind = fieldKind(fn, field);
  const value: unknown = kind === 'number' ? Number(rawValue) : rawValue;
  let q = mergeIntentArgs(queue, intentId, { [field]: value });
  if (intent.messageId) {
    const label = fieldLabel(field, deps.locale);
    const shown = kind === 'enum'
      ? (enumOptions(fn, field, deps.locale).find((o) => o.value === rawValue)?.label ?? rawValue)
      : rawValue;
    deps.patchMessage(intent.messageId, { resolutionState: 'resolved', resolutionResult: `${label}: ${shown}` });
  }
  q = patchIntent(q, intentId, { status: 'queued' });
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
