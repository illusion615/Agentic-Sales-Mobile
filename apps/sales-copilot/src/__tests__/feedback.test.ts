import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getScenarioStyle,
  setScenarioStyle,
  getFeedbackEnabled,
  setFeedbackEnabled,
  subscribeFeedback,
  fireFeedback,
  SCENARIOS,
  type FeedbackEvent,
} from '@/lib/feedback';

/**
 * Unit coverage for the scenario-feedback logic core. Verifies default
 * resolution, persistence, validation fallback, and the trigger bus gating
 * (master switch + per-scenario 'none').
 */
describe('feedback settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('resolves built-in defaults (milestone=confetti, others=none)', () => {
    expect(getScenarioStyle('milestone')).toBe('confetti');
    expect(getScenarioStyle('success')).toBe('none');
    expect(getScenarioStyle('failure')).toBe('none');
    expect(getScenarioStyle('warning')).toBe('none');
  });

  it('persists and reads back a chosen style', () => {
    setScenarioStyle('success', 'check-pulse');
    expect(getScenarioStyle('success')).toBe('check-pulse');
  });

  it('falls back to the default when the saved value is not allowed for the scenario', () => {
    // 'confetti' is not a valid style for the failure scenario.
    localStorage.setItem('feedbackStyle:failure', 'confetti');
    expect(getScenarioStyle('failure')).toBe(SCENARIOS.failure.defaultStyle);
  });

  it('master toggle defaults to enabled and persists', () => {
    expect(getFeedbackEnabled()).toBe(true);
    setFeedbackEnabled(false);
    expect(getFeedbackEnabled()).toBe(false);
    setFeedbackEnabled(true);
    expect(getFeedbackEnabled()).toBe(true);
  });
});

describe('fireFeedback (trigger bus gating)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('emits a resolved event for a scenario with an active style', () => {
    const events: FeedbackEvent[] = [];
    const unsub = subscribeFeedback((e) => events.push(e));
    fireFeedback('milestone'); // default confetti
    unsub();
    expect(events).toHaveLength(1);
    expect(events[0].scenario).toBe('milestone');
    expect(events[0].style).toBe('confetti');
  });

  it('does not emit when the scenario style is none', () => {
    const listener = vi.fn();
    const unsub = subscribeFeedback(listener);
    fireFeedback('success'); // default none
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not emit when the master switch is off', () => {
    setScenarioStyle('success', 'glow');
    setFeedbackEnabled(false);
    const listener = vi.fn();
    const unsub = subscribeFeedback(listener);
    fireFeedback('success');
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribeFeedback(listener);
    unsub();
    fireFeedback('milestone');
    expect(listener).not.toHaveBeenCalled();
  });
});
