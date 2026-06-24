/**
 * Tests for the AgentError structured error model.
 */
import { describe, it, expect } from 'vitest';
import { agentError, isAgentError, rootCause, toUserMessage, toDevLog } from '@/lib/errors';

describe('AgentError', () => {
  it('creates a simple error with type and layer', () => {
    const err = agentError('llm', 'frame', 'LLM call failed');
    expect(err.type).toBe('llm');
    expect(err.layer).toBe('frame');
    expect(err.message).toBe('LLM call failed');
    expect(err.cause).toBeUndefined();
  });

  it('wraps a cause Error and preserves the chain', () => {
    const original = new Error('502 Bad Gateway');
    const wrapped = agentError('llm', 'transport', 'Flow invocation failed', original);
    expect(wrapped.cause).toBe(original);
    expect(rootCause(wrapped)).toBe(original);
  });

  it('wraps nested AgentError as cause chain', () => {
    const inner = agentError('parse', 'frame', 'JSON parse failed');
    const outer = agentError('llm', 'orchestrator', 'Frame classification failed', inner);
    expect(isAgentError(outer.cause)).toBe(true);
    expect(rootCause(outer)).toBe(inner);
  });

  it('toUserMessage returns user-friendly text, not internals', () => {
    const err = agentError('llm', 'frame', 'Frame failed: {giant JSON blob...}');
    expect(toUserMessage(err, 'zh-Hans')).toBe('智能服务暂时不可用，请稍后重试。');
    expect(toUserMessage(err, 'en')).toBe('AI service temporarily unavailable. Please retry.');
  });

  it('toDevLog includes full chain for debugging', () => {
    const inner = agentError('transport', 'transport', '502 Bad Gateway');
    const outer = agentError('llm', 'frame', 'Frame call failed', inner);
    const log = toDevLog(outer);
    expect(log).toContain('[frame/llm]');
    expect(log).toContain('Frame call failed');
    expect(log).toContain('[transport/transport]');
    expect(log).toContain('502 Bad Gateway');
  });

  it('isAgentError discriminates correctly', () => {
    expect(isAgentError(agentError('llm', 'frame', 'test'))).toBe(true);
    expect(isAgentError(new Error('plain'))).toBe(false);
    expect(isAgentError(null)).toBe(false);
    expect(isAgentError('string')).toBe(false);
  });
});
