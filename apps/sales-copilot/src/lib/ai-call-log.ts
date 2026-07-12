/**
 * AI Call Ledger
 * --------------------------------------------------------------------------
 * Records EVERY LLM (AI Builder prompt) invocation the app makes, so the Frame
 * Inspector can show — per user input — the full list of AI calls and their
 * rough consumption.
 *
 * Why client-side (not a Dataverse table): every AI call in the app funnels
 * through the single `invokeFlowForLLM` choke point, so instrumenting it here
 * captures 100% of calls (Frame, Orchestrator, follow-up suggestions, retries,
 * chat, response generation, skills, propose-changes, …) with zero risk of a
 * server-side log falling out of sync. The `crf5c_agentlogs` DV table is NOT a
 * reliable source — it currently holds only seed rows and has no cost column.
 *
 * "Consumption": AI Builder bills per call (credits), and the client does not
 * receive token usage back from the prompt API. So we record the exact prompt
 * and response CHARACTER counts (the real drivers of the credit tier) plus a
 * rough token ESTIMATE (~chars/4). Latency is captured too.
 *
 * Correlation: `beginAiTurn(userMessage)` stamps a turn id at the start of each
 * user turn (called from copilot-context.sendMessage). Every call recorded
 * until the next turn is attributed to it. Calls made outside a turn (startup
 * warm-ups, restored-conversation suggestions) land under an empty turn id.
 */

const RING_KEY = 'copilot-ai-call-log';
const RING_MAX = 250;

export interface AiCallEntry {
  /** When the call completed (ms epoch). */
  ts: number;
  /** Turn correlation id (empty for calls made outside a user turn). */
  turnId: string;
  /** The user message that started the turn (for display / matching). */
  turnMessage: string;
  /** Human label for the call site, e.g. "Frame", "Orchestrator", "Follow-up suggestions". */
  label: string;
  /** The requested response format passed to invokeFlowForLLM. */
  responseFormat: string;
  /** Exact serialized prompt length in characters. */
  promptChars: number;
  /** Exact response length in characters (0 on failure). */
  responseChars: number;
  /** Round-trip latency in ms. */
  latencyMs: number;
  /** Whether the call succeeded. */
  ok: boolean;
  /** Per-call correlation GUID injected at the start of the prompt (empty if cost logging is off). */
  traceId: string;
}

// ---- current turn (module singleton) -------------------------------------

let currentTurnId = '';
let currentTurnMessage = '';

/** Start a new AI turn; returns its id. Call once per user message. */
export function beginAiTurn(userMessage: string): string {
  currentTurnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  currentTurnMessage = userMessage;
  return currentTurnId;
}

/** The id of the turn currently in progress (empty before the first turn). */
export function getCurrentAiTurnId(): string {
  return currentTurnId;
}

// ---- token estimate ------------------------------------------------------

/** Rough token estimate from a character count (~4 chars/token). Approximate. */
export function estimateTokens(chars: number): number {
  return chars > 0 ? Math.round(chars / 4) : 0;
}

// ---- ring buffer ---------------------------------------------------------

export function recordAiCall(entry: Omit<AiCallEntry, 'ts' | 'turnId' | 'turnMessage'>): void {
  try {
    const full: AiCallEntry = {
      ...entry,
      ts: Date.now(),
      turnId: currentTurnId,
      turnMessage: currentTurnMessage,
    };
    const list = readAiCallLog();
    list.unshift(full);
    while (list.length > RING_MAX) list.pop();
    sessionStorage.setItem(RING_KEY, JSON.stringify(list));
  } catch {
    /* sessionStorage may be unavailable in some embeddings — logging is best-effort */
  }
}

export function readAiCallLog(): AiCallEntry[] {
  try {
    const raw = sessionStorage.getItem(RING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiCallEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearAiCallLog(): void {
  try {
    sessionStorage.removeItem(RING_KEY);
  } catch {
    /* noop */
  }
}

// ---- per-turn aggregation ------------------------------------------------

export interface AiTurnConsumption {
  calls: AiCallEntry[];
  callCount: number;
  totalPromptChars: number;
  totalResponseChars: number;
  totalTokensEst: number;
  totalLatencyMs: number;
}

/** Aggregate all AI calls recorded for a given turn id (oldest-first). */
export function aiCallsForTurn(turnId: string): AiTurnConsumption {
  const calls = readAiCallLog()
    .filter((c) => c.turnId === turnId)
    .sort((a, b) => a.ts - b.ts);
  return summarizeAiCalls(calls);
}

/** Aggregate a given set of AI-call entries. */
export function summarizeAiCalls(calls: AiCallEntry[]): AiTurnConsumption {
  let totalPromptChars = 0;
  let totalResponseChars = 0;
  let totalLatencyMs = 0;
  for (const c of calls) {
    totalPromptChars += c.promptChars;
    totalResponseChars += c.responseChars;
    totalLatencyMs += c.latencyMs;
  }
  return {
    calls,
    callCount: calls.length,
    totalPromptChars,
    totalResponseChars,
    totalTokensEst: estimateTokens(totalPromptChars + totalResponseChars),
    totalLatencyMs,
  };
}

// ---- trace id (prompt ↔ AI Event correlation) --------------------------

/**
 * Regex to pull the trace GUID back out of a stored prompt
 * (AI Event `msdyn_datainfo.prompt_20text`). The marker sits at char 0 of the
 * prompt so it always survives the AI Event 4000-char truncation.
 */
export const TRACE_MARKER_RE = /\[\[trace:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/i;

/** Generate a correlation GUID for one AI call. */
export function newTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The single line prepended to a prompt so the AI Event row (whose prompt_20text
 * starts at char 0 and is truncated at 4000) always carries the GUID → exact 1:1
 * join to the Agent Log row. It reads as inert metadata; the model ignores it.
 */
export function formatTracePrefix(traceId: string): string {
  return `[[trace:${traceId}]] (internal correlation id — ignore this line)\n`;
}

/** Extract the trace GUID from a stored prompt string (null if absent). */
export function extractTraceId(promptText: string): string | null {
  const m = promptText.match(TRACE_MARKER_RE);
  return m ? m[1].toLowerCase() : null;
}
