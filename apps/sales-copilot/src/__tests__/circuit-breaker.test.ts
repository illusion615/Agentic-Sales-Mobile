/**
 * Circuit breaker + match thresholds tests.
 * Tests the split-channel circuit breaker and configurable match thresholds.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCircuitBreakerState,
  recordCircuitBreakerFailure,
  recordCircuitBreakerSuccess,
  isCircuitBreakerOpen,
  getMatchThresholds,
} from '@/lib/agent-utils';

describe('circuit-breaker', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts in closed state', () => {
    expect(isCircuitBreakerOpen()).toBe(false);
  });

  it('opens after 3 consecutive failures', () => {
    recordCircuitBreakerFailure();
    recordCircuitBreakerFailure();
    expect(isCircuitBreakerOpen()).toBe(false);
    recordCircuitBreakerFailure();
    expect(isCircuitBreakerOpen()).toBe(true);
  });

  it('resets on success', () => {
    recordCircuitBreakerFailure();
    recordCircuitBreakerFailure();
    recordCircuitBreakerFailure();
    expect(isCircuitBreakerOpen()).toBe(true);
    recordCircuitBreakerSuccess();
    expect(isCircuitBreakerOpen()).toBe(false);
  });

  it('state includes failure count and timestamps', () => {
    recordCircuitBreakerFailure();
    const state = getCircuitBreakerState();
    expect(state.failures).toBe(1);
    expect(state.lastFailure).toBeGreaterThan(0);
    expect(state.isOpen).toBe(false);
  });
});

describe('match-thresholds', () => {
  beforeEach(() => {
    localStorage.removeItem('copilot-match-thresholds');
  });

  it('returns default thresholds', () => {
    const t = getMatchThresholds();
    expect(t.high).toBe(70);
    expect(t.medium).toBe(50);
    expect(t.low).toBe(25);
  });

  it('reads custom thresholds from localStorage', () => {
    localStorage.setItem('copilot-match-thresholds', JSON.stringify({ high: 80, medium: 60 }));
    const t = getMatchThresholds();
    expect(t.high).toBe(80);
    expect(t.medium).toBe(60);
    expect(t.low).toBe(25);
  });

  it('ignores invalid localStorage data', () => {
    localStorage.setItem('copilot-match-thresholds', 'not-json');
    const t = getMatchThresholds();
    expect(t.high).toBe(70); // falls back to default
  });
});
