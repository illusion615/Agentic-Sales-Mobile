import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toast } from '@/lib/toast-utils';
import {
  setScenarioStyle,
  setFeedbackEnabled,
  subscribeFeedback,
  type FeedbackEvent,
} from '@/lib/feedback';

/**
 * The app-wide toast (toast-utils) must actually play the user's chosen
 * Scenario Feedback: success / error / warning toasts fire the matching
 * feedback scenario through the bus, while info / plain toasts stay silent.
 *
 * This is the wiring that was missing — every screen imported sonner's `toast`
 * directly, so success/failure/warning feedback never fired on real events
 * (only 'milestone' was hard-wired in a couple of places).
 */
describe('app toast fires scenario feedback', () => {
  beforeEach(() => {
    localStorage.clear();
    setFeedbackEnabled(true);
    // Opt each scenario into a visible style so fireFeedback is not gated to 'none'.
    setScenarioStyle('success', 'glow');
    setScenarioStyle('failure', 'shake');
    setScenarioStyle('warning', 'attention-ring');
  });

  it('toast.success plays the success scenario', () => {
    const events: FeedbackEvent[] = [];
    const unsub = subscribeFeedback((e) => events.push(e));
    toast.success('saved');
    unsub();
    expect(events.map((e) => e.scenario)).toContain('success');
  });

  it('toast.error plays the failure scenario', () => {
    const events: FeedbackEvent[] = [];
    const unsub = subscribeFeedback((e) => events.push(e));
    toast.error('nope');
    unsub();
    expect(events.map((e) => e.scenario)).toContain('failure');
  });

  it('toast.warning plays the warning scenario', () => {
    const events: FeedbackEvent[] = [];
    const unsub = subscribeFeedback((e) => events.push(e));
    toast.warning('careful');
    unsub();
    expect(events.map((e) => e.scenario)).toContain('warning');
  });

  it('toast.info and a plain toast stay silent', () => {
    const listener = vi.fn();
    const unsub = subscribeFeedback(listener);
    toast.info('fyi');
    toast('plain');
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it('respects the master switch (no feedback when disabled)', () => {
    setFeedbackEnabled(false);
    const listener = vi.fn();
    const unsub = subscribeFeedback(listener);
    toast.success('saved');
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it('still returns sonner toast ids (pass-through preserved)', () => {
    const id = toast.success('saved');
    expect(id === undefined).toBe(false);
  });
});
