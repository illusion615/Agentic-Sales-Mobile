import { beforeEach, describe, expect, it } from 'vitest';
import {
  aiCallsForTurn,
  beginAiTurn,
  clearAiCallLog,
  extractTraceId,
  formatTracePrefix,
  newTraceId,
  recordAiCall,
  TRACE_MARKER_RE,
} from '../ai-cost';

const call = (overrides: Partial<Parameters<typeof recordAiCall>[0]> = {}) => ({
  label: 'Frame',
  responseFormat: 'json',
  promptChars: 100,
  responseChars: 20,
  latencyMs: 500,
  ok: true,
  traceId: newTraceId(),
  ...overrides,
});

describe('ai call ledger', () => {
  beforeEach(() => clearAiCallLog());

  it('attributes calls to the turn in progress', () => {
    const turnId = beginAiTurn('how many contacts?');
    recordAiCall(call());
    recordAiCall(call({ label: 'Orchestrator' }));

    const turn = aiCallsForTurn(turnId);
    expect(turn.callCount).toBe(2);
    expect(turn.totalPromptChars).toBe(200);
    expect(turn.totalTokensEst).toBe(60); // (200 + 40) / 4
  });

  it('excludes detached calls from the turn', () => {
    const turnId = beginAiTurn('anything');
    recordAiCall(call());
    recordAiCall(call({ label: 'Background insight' }), { detached: true });

    expect(aiCallsForTurn(turnId).callCount).toBe(1);
  });

  it('does not leak calls across turns', () => {
    const first = beginAiTurn('first');
    recordAiCall(call());
    const second = beginAiTurn('second');
    recordAiCall(call());

    expect(aiCallsForTurn(first).callCount).toBe(1);
    expect(aiCallsForTurn(second).callCount).toBe(1);
  });
});

describe('trace correlation', () => {
  it('survives prompt truncation because the marker sits at char 0', () => {
    const traceId = newTraceId();
    const prompt = formatTracePrefix(traceId) + 'x'.repeat(20_000);

    // The platform stores only the first 4000 chars of the prompt.
    expect(extractTraceId(prompt.slice(0, 4000))).toBe(traceId.toLowerCase());
  });

  it('round-trips through the canonical matcher regex', () => {
    const traceId = newTraceId();
    const match = formatTracePrefix(traceId).match(TRACE_MARKER_RE);
    expect(match?.[1].toLowerCase()).toBe(traceId.toLowerCase());
  });

  it('returns null when no marker is present', () => {
    expect(extractTraceId('a prompt with no marker')).toBeNull();
  });

  it('generates well-formed v4 GUIDs', () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
