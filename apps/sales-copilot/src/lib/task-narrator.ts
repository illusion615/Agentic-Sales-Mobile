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
