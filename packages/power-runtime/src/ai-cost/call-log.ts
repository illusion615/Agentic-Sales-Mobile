/**
 * AI Call Ledger
 * --------------------------------------------------------------------------
 * Records EVERY LLM invocation the app makes, so a debug surface can show —
 * per user input — the full list of AI calls and their rough consumption.
 *
 * Why client-side: every AI call funnels through a single invoke choke point,
 * so instrumenting there captures 100% of calls (classification, planning,
 * skills, retries, chat) with zero risk of a server-side log falling out of
 * sync.
 *
 * "Consumption": AI Builder bills per call (credits), and the client does not
 * receive token usage back from the prompt API. So we record the exact prompt
 * and response CHARACTER counts (the real drivers of the credit tier) plus a
 * rough token ESTIMATE (~chars/4). Latency is captured too.
 *
 * Correlation: `beginAiTurn(userMessage)` stamps a turn id at the start of each
 * user turn. Every call recorded until the next turn is attributed to it,
 * unless the caller explicitly marks it detached (standalone/background AI work
 * has its own log row). Calls made outside a turn land under an empty turn id.
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
  /** Human label for the call site, e.g. "Frame", "Orchestrator". */
  label: string;
  /** The requested response format passed to the invoke boundary. */
  responseFormat: string;
  /** Exact serialized prompt length in characters. */
  promptChars: number;
  /** Exact response length in characters (0 on failure). */
  responseChars: number;
  /** Round-trip latency in ms. */
  latencyMs: number;
  /** Whether the call succeeded. */
  ok: boolean;
  /** Per-call correlation GUID injected at the start of the prompt. */
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

export function recordAiCall(
  entry: Omit<AiCallEntry, 'ts' | 'turnId' | 'turnMessage'>,
  options?: { detached?: boolean },
): void {
  try {
    const full: AiCallEntry = {
      ...entry,
      ts: Date.now(),
      turnId: options?.detached ? '' : currentTurnId,
      turnMessage: options?.detached ? '' : currentTurnMessage,
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
 * Regex to pull the trace GUID back out of a stored prompt (the AI Event
 * `msdyn_datainfo.prompt_20text`). The marker sits at char 0 of the prompt so
 * it always survives the AI Event 4000-char truncation.
 */
export const TRACE_MARKER_RE = /\[\[trace:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s+project:([A-Za-z0-9._-]+))?(?:\s+app:([A-Za-z0-9._-]+))?(?:\s+prompt:([A-Za-z0-9._-]+))?\]\]/i;

/** Generate a correlation GUID for one AI call. */
export function newTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The single line prepended to a prompt so the AI Event row (whose prompt text
 * starts at char 0 and is truncated at 4000) always carries the GUID → exact
 * 1:1 join to the log row. It reads as inert metadata; the model ignores it.
 *
 * Naming the prompt here is what lets the platform's own AI Event log answer
 * "which prompt ran, when, at what cost" on its own — so the app does not write
 * a second record of every call.
 */
export function formatTracePrefix(
  traceId: string,
  promptKey?: string,
  appId?: string,
  projectId?: string,
): string {
  const project = projectId ? ` project:${projectId}` : '';
  const app = appId ? ` app:${appId}` : '';
  const key = promptKey ? ` prompt:${promptKey}` : '';
  return `[[trace:${traceId}${project}${app}${key}]] (internal correlation id — ignore this line)\n`;
}

/** Extract the trace GUID from a stored prompt string (null if absent). */
export function extractTraceId(promptText: string): string | null {
  const m = promptText.match(TRACE_MARKER_RE);
  return m ? m[1].toLowerCase() : null;
}

/** Which catalogued prompt produced the call, when the marker declares it. */
export function extractPromptKey(promptText: string): string | null {
  const m = promptText.match(TRACE_MARKER_RE);
  return m && m[4] ? m[4] : null;
}

/** Which application produced the call, when the marker declares it. */
export function extractAppId(promptText: string): string | null {
  const m = promptText.match(TRACE_MARKER_RE);
  return m && m[3] ? m[3] : null;
}

/** Which product/project owns the call, when the marker declares it. */
export function extractProjectId(promptText: string): string | null {
  const m = promptText.match(TRACE_MARKER_RE);
  return m && m[2] ? m[2] : null;
}
