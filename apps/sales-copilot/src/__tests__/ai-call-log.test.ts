import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginAiTurn,
  clearAiCallLog,
  extractTraceId,
  formatTracePrefix,
  newTraceId,
  readAiCallLog,
  recordAiCall,
  TRACE_MARKER_RE,
} from '@/lib/ai-call-log';

beforeEach(() => clearAiCallLog());

describe('ai-call-log trace helpers', () => {
  it('newTraceId returns a v4-shaped GUID', () => {
    const id = newTraceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('newTraceId is unique across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newTraceId()));
    expect(ids.size).toBe(50);
  });

  it('formatTracePrefix puts the GUID at char 0 (survives 4000-char truncation)', () => {
    const id = newTraceId();
    const prefix = formatTracePrefix(id);
    expect(prefix.startsWith(`[[trace:${id}]]`)).toBe(true);
    expect(prefix.endsWith('\n')).toBe(true);
    // The marker is well within the first 4000 chars even after a huge prompt.
    const prompt = prefix + 'system: '.padEnd(20000, 'x');
    expect(prompt.slice(0, 4000)).toContain(`[[trace:${id}]]`);
  });

  it('extractTraceId round-trips the injected GUID', () => {
    const id = newTraceId();
    const prompt = formatTracePrefix(id) + 'system: You are the execution planner…';
    expect(extractTraceId(prompt)).toBe(id.toLowerCase());
  });

  it('extractTraceId returns null when no marker is present', () => {
    expect(extractTraceId('system: plain prompt with no trace')).toBeNull();
  });

  it('TRACE_MARKER_RE matches the stored prompt_20text form', () => {
    const id = newTraceId();
    const stored = `[[trace:${id}]] (internal correlation id — ignore this line)\nsystem: …`;
    const m = stored.match(TRACE_MARKER_RE);
    expect(m?.[1].toLowerCase()).toBe(id.toLowerCase());
  });

  it('detaches standalone AI work from the active chat turn', () => {
    beginAiTurn('chat message');
    recordAiCall({
      label: 'Skill: generateEntitySummary',
      responseFormat: 'text',
      promptChars: 100,
      responseChars: 50,
      latencyMs: 25,
      ok: true,
      traceId: newTraceId(),
    }, { detached: true });

    const [call] = readAiCallLog();
    expect(call.turnId).toBe('');
    expect(call.turnMessage).toBe('');
  });
});
