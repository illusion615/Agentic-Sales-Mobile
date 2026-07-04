/**
 * Retry utility with exponential backoff + jitter.
 *
 * Usage:
 *   const result = await withRetry(() => fetchData(), { attempts: 3, backoffMs: 500 });
 */

export interface RetryOptions {
  /** Total attempts (including the first). Default 3. */
  attempts?: number;
  /** Base backoff in ms before the first retry. Default 500. */
  backoffMs?: number;
  /** Multiply backoff by this factor each retry. Default 2 (exponential). */
  factor?: number;
  /** Max jitter added to each delay, in ms. Default equals backoffMs. */
  jitterMs?: number;
  /** Optional predicate: return false to skip retry for specific errors. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT: Required<Omit<RetryOptions, 'shouldRetry'>> = {
  attempts: 3,
  backoffMs: 500,
  factor: 2,
  jitterMs: 500,
};

/**
 * Execute `fn` with retry. Rejects with the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const { attempts, backoffMs, factor, jitterMs } = { ...DEFAULT, ...opts };
  const shouldRetry = opts?.shouldRetry ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !shouldRetry(err, attempt)) break;

      const delay = backoffMs * Math.pow(factor, attempt - 1)
        + Math.random() * (jitterMs ?? backoffMs);
      console.warn(`[withRetry] attempt ${attempt}/${attempts} failed, retrying in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Reject if `promise` does not settle within `ms`.
 *
 * The Power Apps Dataverse SDK returns a promise that can stay *pending* when
 * the network or DNS drops mid-flight (the underlying `$batch` XHR neither
 * resolves nor rejects). A react-query whose queryFn awaits such a promise
 * never leaves `isLoading`, so any UI gated on it (e.g. the home KPI cards)
 * spins forever. Racing the call against a timeout converts that silent hang
 * into a normal rejection, so react-query can settle into an error state and
 * later refetch on reconnect.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`) as Error & { agentErrorType: string };
      err.agentErrorType = 'timeout';
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
