/**
 * AI call ledger — the per-turn record of every LLM invocation.
 *
 * The implementation is platform-generic and lives in
 * `@agentic/power-runtime`; this module keeps the app's import path stable.
 */
export {
  beginAiTurn,
  getCurrentAiTurnId,
  estimateTokens,
  recordAiCall,
  readAiCallLog,
  clearAiCallLog,
  aiCallsForTurn,
  summarizeAiCalls,
  TRACE_MARKER_RE,
  newTraceId,
  formatTracePrefix,
  extractTraceId,
} from '@agentic/power-runtime';

export type { AiCallEntry, AiTurnConsumption } from '@agentic/power-runtime';
