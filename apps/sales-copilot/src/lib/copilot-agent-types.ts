/**
 * Copilot Agent — shared type definitions.
 * Extracted from copilot-agent.ts to reduce file size and enable reuse.
 */

import type { ValidatedIntentResult, SingleIntent, PendingResolution, AwaitingClarification } from './agent-utils';

export const GREETING_PATTERN = /^(hi|hello|hey|你好|您好|嗨|早上好|下午好|晚上好|good\s*(morning|afternoon|evening))\b/i;

export const DAILY_REPORT_PATTERN = /daily\s*report|today'?s?\s*report|工作日报|今日日报|今天的报告|生成今日|生成[\u4e00-\u9fa5]*?报/i;

export interface ThinkingStep {
  stage: 'intent' | 'matching' | 'executing' | 'generating';
  status: 'pending' | 'active' | 'completed';
  label: string;
  detail?: string;
}

export interface ThinkingProgress {
  stage: 'intent' | 'executing' | 'generating' | 'matching';
  status: 'active' | 'completed';
  intentLabel?: string;
  functionDisplayName?: string;
  detail?: string;
}

export interface AgentResponse {
  success: boolean;
  content: string;
  error?: string;
  functionCalled?: string;
  functionDisplayName?: string;
  functionResult?: unknown;
  invalidateQueries?: string[];
  latencyMs?: number;
  thinkingSteps?: ThinkingStep[];
  recordList?: {
    type: 'account' | 'opportunity' | 'activity' | 'contact';
    records: Array<{
      id: string;
      title: string;
      subtitle?: string;
      meta?: string;
    }>;
    title: string;
  };
  additionalIntents?: {
    message: string;
    items: Array<{
      type: 'activity' | 'opportunity' | 'account' | 'contact';
      isNew: boolean;
      data: Record<string, unknown>;
      batchIndex: number;
      reason: string;
      userFacingLabel?: { zh: string; en: string };
      intentIndex?: number;
    }>;
  };
  intentAnalysis?: {
    totalIntents: number;
    summary: string;
  };
  /** Phase B: per-intent overview for the multi-intent announce bubble. */
  intentsOverview?: Array<{ intentIndex: number; userFacingLabel: { zh: string; en: string } }>;
  /** Phase B: 0-based intent index for blocking responses. */
  currentIntentIndex?: number;
  /** Raw parsed intent from LLM Pass-1. */
  rawIntent?: IntentResult;
  /** Awaiting clarification state for resolution cascade. */
  awaitingClarification?: AwaitingClarification;
}

export interface IntentResult extends Partial<ValidatedIntentResult> {
  function: string | null;
  arguments?: Record<string, unknown>;
  directResponse?: string;
  userFacingLabel?: { zh: string; en: string };
  additionalActions?: Array<{
    function: string;
    arguments: Record<string, unknown>;
    reason?: string;
    userFacingLabel?: { zh: string; en: string };
  }>;
  requiresMatching?: boolean;
  matchTarget?: {
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
  };
  resolutions?: Array<{
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
    scopeBy?: 'account' | 'opportunity';
    intentIndex?: number;
  }>;
  multiIntentAnalysis?: {
    hasMultipleIntents: boolean;
    summary?: string;
  };
  contextSufficient?: boolean;
}

/** Typed shape for fuzzy match results. */
export interface FuzzyMatchData {
  matches: Array<{
    id: string;
    name: string;
    score: number;
    matchType: string;
    accountId?: string;
    accountName?: string;
  }>;
  confidence: 'high' | 'medium' | 'low' | 'none';
  needsConfirmation: boolean;
  exactMatch?: {
    id: string;
    name: string;
    score: number;
    accountId?: string;
    accountName?: string;
  };
  pendingIntent?: {
    function: string;
    arguments: Record<string, unknown>;
    additionalActions?: IntentResult['additionalActions'];
  };
}

/** Type guard for resolution items that carry an intentIndex. */
export interface IndexedResolution {
  entityType: 'account' | 'contact' | 'opportunity' | 'activity';
  query: string;
  scopeBy?: 'account' | 'opportunity';
  intentIndex?: number;
}

/**
 * Build the per-intent overview for UI announce.
 */
export function buildIntentsOverview(intent: IntentResult): AgentResponse['intentsOverview'] {
  const out: NonNullable<AgentResponse['intentsOverview']> = [];
  if (intent.userFacingLabel) {
    out.push({ intentIndex: 0, userFacingLabel: intent.userFacingLabel });
  }
  if (intent.additionalActions) {
    intent.additionalActions.forEach((a, i) => {
      if (a.userFacingLabel) {
        out.push({ intentIndex: i + 1, userFacingLabel: a.userFacingLabel });
      }
    });
  }
  return out.length > 1 ? out : undefined;
}
