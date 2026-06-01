/**
 * Task narrator — produces the human-friendly "announce" text shown when a
 * multi-intent task is about to start, and (Phase C) can adjust the task's
 * arguments based on prior task outcomes.
 *
 * Phase A: synchronous fallback only — wraps the userFacingLabel from the
 *   frame planner into a sentence. No LLM call.
 * Phase C: adds an async `narrateTask()` that calls a small LLM with prior
 *   task outcomes to produce context-aware phrasing + optional parameter
 *   tweaks. See design doc in conversation history.
 */

export type Locale = 'zh-Hans' | 'en';

export interface PriorTaskOutcome {
  /** Stable id of the prior task (the orchestrator's taskGroupId). */
  taskGroupId: string;
  /** Human label that was shown for that task. */
  label: string;
  /** Final outcome line — e.g. "associated Royal London Hospital", "existing opportunity reused". */
  outcome: string;
  /** Any resolved entity ids that downstream tasks can reference. */
  entityIds?: Partial<{
    accountId: string;
    accountName: string;
    contactId: string;
    contactName: string;
    opportunityId: string;
    opportunityName: string;
  }>;
}

export interface TaskNarrationInput {
  taskIndex: number;     // 1-based
  total: number;
  /** Localized label from frame planner / fallback table. */
  label: string;
  /** Skill function name for this task (e.g. "draftActivity"). */
  fnName: string;
  /** Prior task outcomes (in execution order). Empty for the first task. */
  prior: PriorTaskOutcome[];
  locale: Locale;
}

export interface TaskNarration {
  /** Sentence shown in the announce bubble. */
  announceText: string;
  /** Optional parameter overrides for this task (Phase C — narrator-suggested). */
  adjustedArguments?: Record<string, unknown>;
  /** If true, the orchestrator should skip this task entirely. */
  shouldSkip?: boolean;
  /** When shouldSkip=true, a brief reason shown in the collapsed line. */
  skipReason?: string;
}

/** Sync fallback narration. Used as a safety net and for Phase A. */
export function narrateTaskSync(input: TaskNarrationInput): TaskNarration {
  const { taskIndex, total, label, locale } = input;
  const isZh = locale === 'zh-Hans';
  if (total <= 1) {
    return {
      announceText: isZh ? `开始：${label}` : `Starting: ${label}`,
    };
  }
  const ordinalZh = ['第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八'][taskIndex - 1] ?? `第${taskIndex}`;
  return {
    announceText: isZh
      ? `现在开始${ordinalZh}个任务：${label}`
      : `Starting task ${taskIndex} of ${total}: ${label}`,
  };
}

// ---------------------------------------------------------------------------
// Phase C: async LLM-backed narrator.
//
// Goal — make the per-task announce read like a human handover, e.g.:
//   sync fallback : "现在开始第二个任务：创建商机"
//   narrated      : "用 Royal London Hospital 作为客户，创建新商机"
//
// Implementation notes:
// - The narrator is best-effort. Any failure (no LLM, timeout, malformed
//   output) silently falls back to the sync sentence — the UI must never
//   block waiting for it.
// - We deliberately do NOT expose `adjustedArguments` / `shouldSkip` in
//   this round. Mutating execution from a narrator is high-risk and would
//   need deeper hooks into the cascade orchestrator; ship narration only.
// ---------------------------------------------------------------------------

import { isFlowAvailable } from '@/services/power-automate-service';
import { executeFunction } from '@/lib/function-executor';

const NARRATE_TIMEOUT_MS = 6000;

function buildPrompt(input: TaskNarrationInput): string {
  const isZh = input.locale === 'zh-Hans';
  const priorBlock = input.prior.length === 0
    ? (isZh ? '（无）' : '(none)')
    : input.prior
        .map((p, i) => `${i + 1}. ${p.label} → ${p.outcome}`)
        .join('\n');
  const lang = isZh ? '中文' : 'English';
  const example = isZh
    ? '示例：用 Royal London Hospital 作为客户，创建新商机'
    : 'Example: Create a new opportunity for Royal London Hospital';
  return [
    isZh
      ? '你是销售助手的对话叙述者。下面是用户的多步任务执行进度。请用一句自然的话宣告即将开始的"下一步任务"，要带上从前序任务中已经确定的关键实体（如客户/联系人/商机名称），让用户清楚这一步会做什么。'
      : 'You are the narrator for a sales assistant\'s multi-step task flow. Announce the NEXT task in one natural sentence, carrying forward the key entities (account / contact / opportunity names) that prior tasks have already resolved.',
    '',
    isZh ? `任务进度：${input.taskIndex}/${input.total}` : `Task progress: ${input.taskIndex} of ${input.total}`,
    isZh ? `下一步原始标题：${input.label}` : `Next task raw label: ${input.label}`,
    isZh ? `技能函数：${input.fnName}` : `Skill function: ${input.fnName}`,
    '',
    isZh ? '前序任务结果：' : 'Prior task outcomes:',
    priorBlock,
    '',
    isZh
      ? `要求：用${lang}回复，只输出一句话（不超过 40 字），不要前缀编号、不要加引号、不要解释。${example}`
      : `Requirements: Reply in ${lang}, output ONE sentence only (max 20 words). No prefix, no quotes, no explanation. ${example}`,
  ].join('\n');
}

/**
 * Async narrator. Calls the shared LLM flow with a tight timeout, falling
 * back to the sync sentence on any failure. Always resolves — never throws.
 */
export async function narrateTask(input: TaskNarrationInput): Promise<TaskNarration> {
  const sync = narrateTaskSync(input);
  if (!isFlowAvailable()) return sync;

  try {
    const prompt = buildPrompt(input);
    const llmPromise = executeFunction('narrateTask', {
      data: prompt,
    }, { locale: input.locale });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), NARRATE_TIMEOUT_MS));
    const result = await Promise.race([llmPromise, timeout]);
    if (!result || !result.success || !result.data) return sync;

    const cleaned = (result.data as string)
      .trim()
      .replace(/^["'「『]+|["'」』]+$/g, '')
      .replace(/^\d+[\.、)\s]+/, '')
      .split(/\r?\n/)[0]
      .trim();

    if (!cleaned || cleaned.length > 120) return sync;
    return { announceText: cleaned };
  } catch (err) {
    console.warn('[task-narrator] narrateTask failed, using sync fallback:', err);
    return sync;
  }
}
