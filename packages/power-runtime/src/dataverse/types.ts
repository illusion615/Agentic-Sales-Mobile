/**
 * Minimal structural contracts for talking to Dataverse.
 *
 * These mirror the shapes the Power Apps SDK and the CLI-generated services
 * already produce, but are declared locally so this package never imports an
 * app's generated code (each app generates its own, bound to its own data
 * sources). An app satisfies these by passing its generated service straight
 * in — no adapter needed at the call site.
 */

/** Result envelope returned by every generated Dataverse operation. */
export interface DataverseResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
}

/** Query options accepted by a generated `getAll`, in Dataverse column names. */
export interface DataverseListOptions {
  select?: string[];
  filter?: string;
  orderBy?: string[];
  top?: number;
}

/** A raw Dataverse row: physical column names to values. */
export type DataverseRow = Record<string, unknown>;

/** Error carrying machine-readable classification for agent/error surfaces. */
export interface ClassifiedError extends Error {
  agentErrorType: string;
  agentErrorContext?: Record<string, unknown>;
}

/** Build an `Error` tagged with a machine-readable type and context. */
export function classifiedError(
  message: string,
  agentErrorType: string,
  agentErrorContext?: Record<string, unknown>,
): ClassifiedError {
  const err = new Error(message) as ClassifiedError;
  err.agentErrorType = agentErrorType;
  if (agentErrorContext) err.agentErrorContext = agentErrorContext;
  return err;
}
