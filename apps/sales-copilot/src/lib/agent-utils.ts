/**
 * Agent Utilities
 * Shared utilities for the Copilot agent system
 */

import { z } from 'zod';

// ========== Intent Result Schema with Zod Validation ==========

// I-3 Stage 2: ResolutionItem — describes ONE entity that needs to be resolved.
// `resolutions[]` upgrades the single `matchTarget` into an ordered chain so the
// agent can serially resolve account → contact → opportunity → activity, with
// each later step optionally scoped by an earlier resolved entity.
export const ResolutionItemSchema = z.object({
  entityType: z.enum(['account', 'contact', 'opportunity', 'activity']),
  query: z.string(),
  // Optional dependency: this resolution should be scoped by the named already-resolved entity.
  // e.g. contact resolution `scopeBy: 'account'` means filter contacts within the resolved account.
  scopeBy: z.enum(['account', 'opportunity']).optional(),
  // Phase B: which intent (0-based head, 1+ for additionalActions) this resolution belongs to.
  // Carried through so the Context-side cascade can emit per-task announces on boundary change.
  intentIndex: z.number().int().nonnegative().optional(),
});
export type ResolutionItem = z.infer<typeof ResolutionItemSchema>;

// I-8 Slice A: TemporalMode — semantic tense extracted from user's wording.
// Carried inside draftActivity `arguments.temporalMode` (not top-level) so the
// form-card can derive draftstatusKey and the visibility of the result field
// from temporalMode alone — no need to couple to language-specific tense markers.
//   planned     → activity is in the future or about to happen → status=Confirmed, hide result
//   completed   → activity has already happened → status=Completed, show result, LLM prefills
//   unspecified → no clear tense signal → keep current behavior (Draft, fields shown unfilled)
export const TemporalModeSchema = z.enum(['planned', 'completed', 'unspecified']);
export type TemporalMode = z.infer<typeof TemporalModeSchema>;

export const IntentResultSchema = z.object({
  function: z.string().nullable(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  directResponse: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
  requiresMatching: z.boolean().optional(),
  // Legacy single-target — kept for backward compat; agent normalizes into resolutions[].
  matchTarget: z.object({
    entityType: z.enum(['account', 'contact', 'opportunity', 'activity']),
    query: z.string(),
  }).optional(),
  // I-3: ordered list of entities to resolve in sequence.
  resolutions: z.array(ResolutionItemSchema).optional(),
  additionalActions: z.array(z.object({
    function: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    reason: z.string().optional(),
  })).optional(),
  multiIntentAnalysis: z.object({
    hasMultipleIntents: z.boolean(),
    summary: z.string().optional(),
  }).optional(),
});

// ========== Generalized Multi-Intent Analysis Schema ==========

/**
 * Single intent with confidence and metadata
 */
export const SingleIntentSchema = z.object({
  id: z.string(),
  function: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1),
  priority: z.number().int().min(1),
  type: z.enum(['primary', 'inferred', 'ambiguous']),
  missingFields: z.array(z.string()).optional(),
  source: z.enum(['explicit', 'inferred', 'contextual']),
  reason: z.string().optional(),
});

export type SingleIntent = z.infer<typeof SingleIntentSchema>;

/**
 * Clarification question for ambiguous intents
 */
export const ClarificationQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.unknown(),
  })).optional(),
  targetIntentId: z.string().optional(),
  missingField: z.string().optional(),
  allowFreeInput: z.boolean().optional(),
});

export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

/**
 * Execution plan for multi-intent processing
 */
export const ExecutionPlanSchema = z.object({
  strategy: z.enum(['sequential', 'parallel', 'confirm-first']),
  order: z.array(z.string()),
  confirmRequired: z.array(z.string()).optional(),
  dependencies: z.record(z.string(), z.array(z.string())).optional(),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

/**
 * Complete intent analysis result from LLM
 */
export const IntentAnalysisResultSchema = z.object({
  analysis: z.object({
    totalIntents: z.number().int().min(0),
    summary: z.string(),
    userGoal: z.string().optional(),
  }),
  intents: z.array(SingleIntentSchema),
  needsClarification: z.boolean(),
  clarificationQuestions: z.array(ClarificationQuestionSchema).optional(),
  executionPlan: ExecutionPlanSchema.optional(),
  // Legacy backward compatibility fields
  directResponse: z.string().optional(),
  additionalActions: z.array(z.object({
    function: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    reason: z.string().optional(),
  })).optional(),
  requiresMatching: z.boolean().optional(),
  matchTarget: z.object({
    entityType: z.enum(['account', 'contact', 'opportunity', 'activity']),
    query: z.string(),
  }).optional(),
});

export type IntentAnalysisResult = z.infer<typeof IntentAnalysisResultSchema>;

/**
 * Parse and validate multi-intent analysis from LLM response
 */
export function parseIntentAnalysis(text: string): IntentAnalysisResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: extract first JSON object with regex
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        console.warn('[IntentAnalysis] Failed to extract JSON from response');
        return null;
      }
    } else {
      console.warn('[IntentAnalysis] No JSON found in response');
      return null;
    }
  }

  const result = IntentAnalysisResultSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[IntentAnalysis] Validation failed:', result.error.issues.map((issue: z.ZodIssue) => issue.message).join(', '));
    
    // Try to salvage partial result if basic structure exists
    if (parsed && typeof parsed === 'object' && 'intents' in parsed) {
      const partialData = parsed as Record<string, unknown>;
      const intentsArray = partialData.intents as Array<Record<string, unknown>> | undefined;
      
      if (Array.isArray(intentsArray) && intentsArray.length > 0) {
        // Build a minimal valid result
        const validIntents: SingleIntent[] = intentsArray
          .filter((i: Record<string, unknown>) => i.function && typeof i.function === 'string')
          .map((i: Record<string, unknown>, idx: number) => ({
            id: String(i.id || `intent_${idx + 1}`),
            function: String(i.function),
            arguments: (i.arguments as Record<string, unknown>) || {},
            confidence: typeof i.confidence === 'number' ? i.confidence : 0.7,
            priority: typeof i.priority === 'number' ? i.priority : idx + 1,
            type: (i.type as 'primary' | 'inferred' | 'ambiguous') || (idx === 0 ? 'primary' : 'inferred'),
            source: (i.source as 'explicit' | 'inferred' | 'contextual') || 'explicit',
            reason: i.reason as string | undefined,
            missingFields: i.missingFields as string[] | undefined,
          }));
        
        if (validIntents.length > 0) {
          return {
            analysis: {
              totalIntents: validIntents.length,
              summary: (partialData.analysis as Record<string, unknown>)?.summary as string || 'Partial analysis',
            },
            intents: validIntents,
            needsClarification: Boolean(partialData.needsClarification),
            clarificationQuestions: partialData.clarificationQuestions as ClarificationQuestion[] | undefined,
            executionPlan: partialData.executionPlan as ExecutionPlan | undefined,
          };
        }
      }
    }
    return null;
  }

  return result.data;
}

/**
 * Check if an intent requires user confirmation before execution
 */
export function intentRequiresConfirmation(intent: SingleIntent): boolean {
  // Inferred intents always need confirmation
  if (intent.type === 'inferred') return true;
  
  // Low confidence intents need confirmation
  if (intent.confidence < 0.7) return true;
  
  // Draft functions need confirmation (they show a form)
  const draftFunctions = ['draftActivity', 'draftOpportunity', 'draftAccount', 'draftContact'];
  if (draftFunctions.includes(intent.function)) return true;
  
  // Intents with missing fields need confirmation
  if (intent.missingFields && intent.missingFields.length > 0) return true;
  
  return false;
}

/**
 * Categorize intents into primary and inferred
 * Primary: User explicitly requested (type === 'primary')
 * Inferred: Detected from context (type === 'inferred')
 */
export function categorizeIntents(intents: SingleIntent[]): {
  primary: SingleIntent[];   // User explicitly requested
  inferred: SingleIntent[];  // Detected from context, need confirmation
} {
  const primary: SingleIntent[] = [];
  const inferred: SingleIntent[] = [];
  
  for (const intent of intents) {
    if (intent.type === 'inferred') {
      inferred.push(intent);
    } else {
      primary.push(intent);
    }
  }
  
  // Sort by priority
  primary.sort((a: SingleIntent, b: SingleIntent) => a.priority - b.priority);
  inferred.sort((a: SingleIntent, b: SingleIntent) => a.priority - b.priority);
  
  return { primary, inferred };
}

export type ValidatedIntentResult = z.infer<typeof IntentResultSchema>;

/**
 * Parse and validate JSON from LLM response using Zod
 * Returns null if parsing or validation fails
 */
export function parseAndValidateIntent(text: string): ValidatedIntentResult | null {
  // First try direct parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: extract first JSON object with regex
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        console.warn('[IntentParser] Failed to extract JSON from response');
        return null;
      }
    } else {
      console.warn('[IntentParser] No JSON found in response');
      return null;
    }
  }

  // Validate with Zod
  const result = IntentResultSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[IntentParser] Validation failed:', result.error.issues.map((issue: z.ZodIssue) => issue.message).join(', '));
    // Return partial result if function is at least present
    if (parsed && typeof parsed === 'object' && 'function' in parsed) {
      return {
        function: (parsed as Record<string, unknown>).function as string | null,
        arguments: (parsed as Record<string, unknown>).arguments as Record<string, unknown> | undefined,
        confidence: 50, // Lower confidence for unvalidated
      };
    }
    return null;
  }

  // Add default confidence if not present
  return {
    ...result.data,
    confidence: result.data.confidence ?? 70,
  };
}

// ========== Circuit Breaker Pattern ==========

export type CircuitBreakerChannel = 'llm' | 'dataverse';

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  openedAt: number;
}

const CB_PREFIX = 'copilot-circuit-breaker';
const MAX_FAILURES = 3;
const RECOVERY_TIME_MS = 30000;

function cbKey(ch: CircuitBreakerChannel = 'llm'): string { return `${CB_PREFIX}-${ch}`; }

export function getCircuitBreakerState(channel: CircuitBreakerChannel = 'llm'): CircuitBreakerState {
  try {
    const stored = sessionStorage.getItem(cbKey(channel));
    if (stored) {
      const state = JSON.parse(stored) as CircuitBreakerState;
      if (state.isOpen && Date.now() - state.openedAt > RECOVERY_TIME_MS) {
        return { ...state, isOpen: false };
      }
      return state;
    }
  } catch { /* ignore */ }
  return { failures: 0, lastFailure: 0, isOpen: false, openedAt: 0 };
}

export function recordCircuitBreakerFailure(channel: CircuitBreakerChannel = 'llm'): void {
  const state = getCircuitBreakerState(channel);
  const now = Date.now();
  const failures = now - state.lastFailure > 60000 ? 1 : state.failures + 1;
  const newState: CircuitBreakerState = {
    failures, lastFailure: now,
    isOpen: failures >= MAX_FAILURES,
    openedAt: failures >= MAX_FAILURES ? now : state.openedAt,
  };
  try { sessionStorage.setItem(cbKey(channel), JSON.stringify(newState)); } catch { /* ignore */ }
  if (newState.isOpen) console.warn(`[CircuitBreaker:${channel}] OPEN for`, RECOVERY_TIME_MS / 1000, 's');
}

export function recordCircuitBreakerSuccess(channel: CircuitBreakerChannel = 'llm'): void {
  try { sessionStorage.removeItem(cbKey(channel)); } catch { /* ignore */ }
}

export function isCircuitBreakerOpen(channel: CircuitBreakerChannel = 'llm'): boolean {
  return getCircuitBreakerState(channel).isOpen;
}

// ========== Levenshtein Distance for Fuzzy Matching ==========

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits needed
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  
  // Use two-row matrix for space optimization
  let prevRow = Array.from({ length: bLen + 1 }, (_: unknown, i: number) => i);
  let currRow = new Array<number>(bLen + 1);
  
  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }
  
  return prevRow[bLen];
}

/**
 * Calculate similarity score (0-100) based on Levenshtein distance
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return Math.round((1 - distance / maxLen) * 100);
}

// ========== Match Configuration ==========

export interface MatchThresholds {
  autoSelect: number; // Score >= this → auto-inject without user confirmation
  high: number;    // Score >= this is high confidence
  medium: number;  // Score >= this is medium confidence
  low: number;     // Score >= this is low confidence (below is none)
}

const DEFAULT_THRESHOLDS: MatchThresholds = {
  autoSelect: 90,
  high: 70,
  medium: 50,
  low: 25,
};

const THRESHOLDS_KEY = 'copilot-match-thresholds';

/**
 * Get configurable match thresholds
 */
export function getMatchThresholds(): MatchThresholds {
  try {
    const stored = localStorage.getItem(THRESHOLDS_KEY);
    if (stored) {
      return { ...DEFAULT_THRESHOLDS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_THRESHOLDS;
}

/**
 * Determine confidence level from score
 */
export function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'none' {
  const thresholds = getMatchThresholds();
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.medium) return 'medium';
  if (score >= thresholds.low) return 'low';
  return 'none';
}

// ========== Metrics Tracking ==========

export interface AgentMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  functionUsage: Record<string, number>;
  lastReset: number;
}

const METRICS_KEY = 'copilot-agent-metrics';

/**
 * Get current agent metrics
 */
export function getAgentMetrics(): AgentMetrics {
  try {
    const stored = localStorage.getItem(METRICS_KEY);
    if (stored) {
      return JSON.parse(stored) as AgentMetrics;
    }
  } catch {
    // Ignore parse errors
  }
  return {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    avgLatencyMs: 0,
    functionUsage: {},
    lastReset: Date.now(),
  };
}

/**
 * Record a call in metrics
 */
export function recordMetrics(params: {
  success: boolean;
  latencyMs: number;
  functionCalled?: string;
}): void {
  const metrics = getAgentMetrics();
  
  metrics.totalCalls++;
  if (params.success) {
    metrics.successfulCalls++;
  } else {
    metrics.failedCalls++;
  }
  
  // Update rolling average latency
  const prevTotal = metrics.avgLatencyMs * (metrics.totalCalls - 1);
  metrics.avgLatencyMs = Math.round((prevTotal + params.latencyMs) / metrics.totalCalls);
  
  // Track function usage
  if (params.functionCalled) {
    metrics.functionUsage[params.functionCalled] = 
      (metrics.functionUsage[params.functionCalled] || 0) + 1;
  }
  
  try {
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset metrics
 */
export function resetMetrics(): void {
  try {
    localStorage.removeItem(METRICS_KEY);
  } catch {
    // Ignore storage errors
  }
}

// ========== Enhanced Fuzzy Match Scoring ==========

export interface EnhancedMatchScore {
  score: number;
  matchType: 'exact' | 'contains' | 'fuzzy' | 'levenshtein';
  breakdown: {
    exactMatch: boolean;
    containsMatch: boolean;
    wordOverlap: number;
    levenshteinScore: number;
  };
}

/**
 * Calculate enhanced match score combining multiple algorithms
 */
export function calculateEnhancedMatchScore(
  query: string,
  target: string,
  context?: string
): EnhancedMatchScore {
  const queryLower = query.toLowerCase().trim();
  const targetLower = target.toLowerCase().trim();
  
  // 1. Exact match
  if (queryLower === targetLower) {
    return {
      score: 100,
      matchType: 'exact',
      breakdown: {
        exactMatch: true,
        containsMatch: true,
        wordOverlap: 1,
        levenshteinScore: 100,
      },
    };
  }
  
  // 2. Contains match
  const containsMatch = targetLower.includes(queryLower) || queryLower.includes(targetLower);
  let containsScore = 0;
  if (containsMatch) {
    containsScore = 70 + (Math.min(queryLower.length, targetLower.length) / Math.max(queryLower.length, targetLower.length)) * 20;
  }
  
  // 3. Word overlap
  const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 1);
  const targetWords = targetLower.split(/\s+/).filter((w: string) => w.length > 1);
  const overlap = queryWords.filter((w: string) => 
    targetWords.some((t: string) => t.includes(w) || w.includes(t))
  );
  const wordOverlapScore = queryWords.length > 0 
    ? 30 + (overlap.length / queryWords.length) * 40 
    : 0;
  
  // 4. Levenshtein similarity
  const levScore = levenshteinSimilarity(queryLower, targetLower);
  
  // 5. Context boost (if industry/region matches)
  let contextBoost = 0;
  if (context && context.toLowerCase().includes(queryLower.split(/\s+/)[0])) {
    contextBoost = 10;
  }
  
  // Combine scores with weights
  const combinedScore = Math.min(100, Math.max(
    containsScore,
    wordOverlapScore,
    levScore * 0.8 // Levenshtein slightly weighted down
  ) + contextBoost);
  
  // Determine match type
  let matchType: 'exact' | 'contains' | 'fuzzy' | 'levenshtein' = 'fuzzy';
  if (containsMatch) matchType = 'contains';
  else if (levScore > wordOverlapScore) matchType = 'levenshtein';
  
  return {
    score: Math.round(combinedScore),
    matchType,
    breakdown: {
      exactMatch: false,
      containsMatch,
      wordOverlap: overlap.length / Math.max(queryWords.length, 1),
      levenshteinScore: levScore,
    },
  };
}

// ========== User-Friendly Error Messages ==========

const ERROR_MESSAGES_ZH: Record<string, string> = {
  'recordId is not valid': '该记录可能已被删除或不存在',
  'Unauthorized': '会话已过期，请刷新页面',
  'Network Error': '网络连接失败，请检查网络',
  'timeout': '请求超时，请稍后重试',
  'rate limit': '请求过于频繁，请稍后重试',
};

const ERROR_MESSAGES_EN: Record<string, string> = {
  'recordId is not valid': 'This record may have been deleted or does not exist',
  'Unauthorized': 'Session expired, please refresh the page',
  'Network Error': 'Network connection failed, please check your connection',
  'timeout': 'Request timed out, please try again',
  'rate limit': 'Too many requests, please try again later',
};

/**
 * Map technical error to user-friendly message
 */
export function getUserFriendlyError(error: string, locale: 'zh-Hans' | 'en-US'): string {
  const messages = locale === 'zh-Hans' ? ERROR_MESSAGES_ZH : ERROR_MESSAGES_EN;
  
  for (const [key, message] of Object.entries(messages)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return message;
    }
  }
  
  return error; // Return original if no mapping found
}

// ========== Request Debouncing ==========

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResolve: ((shouldProceed: boolean) => void) | null = null;

/**
 * Debounce rapid requests
 * Returns a promise that resolves to true if this request should proceed,
 * or false if it was superseded by a newer request
 */
export function debounceRequest(delayMs: number = 300): Promise<boolean> {
  // Cancel previous pending request
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    if (pendingResolve) {
      pendingResolve(false); // Tell previous request not to proceed
    }
  }
  
  return new Promise((resolve) => {
    pendingResolve = resolve;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      pendingResolve = null;
      resolve(true); // This request should proceed
    }, delayMs);
  });
}

/**
 * Cancel any pending debounced request
 */
export function cancelDebouncedRequest(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (pendingResolve) {
    pendingResolve(false);
    pendingResolve = null;
  }
}

// ========== Awaiting Clarification Contract (I-2 Stage 1) ==========

export const ResolutionStatusSchema = z.enum(['pending', 'resolved', 'skipped']);
export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;

export const ResolutionCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number(),
  subtitle: z.string().optional(),
});
export type ResolutionCandidate = z.infer<typeof ResolutionCandidateSchema>;

export const PendingResolutionSchema = z.object({
  id: z.string(),
  kind: z.enum(['contact', 'account', 'opportunity']),
  query: z.string(),
  candidates: z.array(ResolutionCandidateSchema),
  status: ResolutionStatusSchema,
});
export type PendingResolution = z.infer<typeof PendingResolutionSchema>;

// G-1: AdditionalAction shape carried alongside the primary intent so that
// chain-create / cascade flows can resume the inferred multi-intent siblings
// after the blocking clarification is cleared.
export const AdditionalActionSchema = z.object({
  function: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  reason: z.string().optional(),
});
export type AdditionalAction = z.infer<typeof AdditionalActionSchema>;

export const AwaitingClarificationSchema = z.object({
  kind: z.literal('awaiting-clarification'),
  pendingResolutions: z.array(PendingResolutionSchema).min(1),
  originalIntent: z.object({
    function: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    additionalActions: z.array(AdditionalActionSchema).optional(),
  }),
  // I-3 Slice 1: carry the remaining resolution queue (entities still to resolve after this blocker is cleared)
  // and the IDs of entities already resolved earlier in the chain (so the next step can scope by them).
  remainingResolutions: z.array(ResolutionItemSchema).optional(),
  resolvedSoFar: z.record(z.string(), z.string()).optional(),
});
export type AwaitingClarification = z.infer<typeof AwaitingClarificationSchema>;

