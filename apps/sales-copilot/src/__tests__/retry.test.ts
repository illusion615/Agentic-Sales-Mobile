/**
 * Retry utility tests — withRetry exponential backoff + jitter.
 */
import { describe, it, expect, vi } from 'vitest';
import { withRetry, withTimeout } from '@/lib/retry';

describe('withRetry', () => {
  it('resolves on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 3, backoffMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 3, backoffMs: 1, jitterMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always-fail'));
    await expect(withRetry(fn, { attempts: 2, backoffMs: 1, jitterMs: 0 })).rejects.toThrow('always-fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no-retry'));
    await expect(withRetry(fn, {
      attempts: 3, backoffMs: 1,
      shouldRetry: () => false,
    })).rejects.toThrow('no-retry');
    expect(fn).toHaveBeenCalledTimes(1); // no retry because predicate returned false
  });

  it('applies exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');
    const start = Date.now();
    await withRetry(fn, { attempts: 3, backoffMs: 50, factor: 2, jitterMs: 0 });
    const elapsed = Date.now() - start;
    // First retry: 50ms, second retry: 100ms → total ~150ms
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'test');
    expect(result).toBe('ok');
  });

  it('rejects with a timeout error when the promise never settles', async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 20, 'Account.getAll')).rejects.toThrow(/Account\.getAll timed out after 20ms/);
  });

  it('tags the timeout error with agentErrorType', async () => {
    const never = new Promise<string>(() => {});
    await withTimeout(never, 20, 'op').catch((err: Error & { agentErrorType?: string }) => {
      expect(err.agentErrorType).toBe('timeout');
    });
    expect.assertions(1);
  });

  it('passes through the original rejection when it happens before the timeout', async () => {
    const failing = Promise.reject(new Error('boom'));
    await expect(withTimeout(failing, 1000, 'op')).rejects.toThrow('boom');
  });
});

