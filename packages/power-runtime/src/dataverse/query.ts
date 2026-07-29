import { withTimeout } from '../async/retry';
import { classifiedError } from './types';

/**
 * Hard ceiling for a single Dataverse list read. Normal `$batch` reads settle
 * in well under a second; this only trips when the SDK promise hangs (network
 * or DNS dropped mid-flight), so it never affects healthy requests. Without it,
 * a hung read keeps the owning react-query in `isLoading` forever and freezes
 * any UI gated on that query.
 */
export const DATAVERSE_READ_TIMEOUT_MS = 20_000;

/**
 * Wrap a Dataverse read with the standard read timeout so a hung SDK promise
 * becomes a normal rejection instead of a permanent pending state.
 */
export function withReadTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return withTimeout(promise, DATAVERSE_READ_TIMEOUT_MS, label);
}

/**
 * Guard for mutation/read ops: refuse to forward an empty id to the generated
 * service layer.
 */
export function requireId(
  id: string | undefined | null,
  op: string,
  entity: string,
): asserts id is string {
  if (!id) {
    throw classifiedError(`${entity}Service.${op}() called with empty id`, 'validation', { op, entity });
  }
}

/** Escape a value for use inside an OData string literal. */
export function odataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Map query options (select/orderBy/filter) from friendly field names to
 * Dataverse column names. `fieldMap` maps friendly name → column name.
 * Generic so the caller's option type survives the mapping.
 */
export function mapOptions<T extends object>(
  opts: T | undefined,
  fieldMap: Record<string, string>,
): T | undefined {
  if (!opts) return opts;
  const mapped = { ...opts } as Record<string, unknown>;

  if (Array.isArray(mapped.select)) {
    mapped.select = (mapped.select as string[]).map((f) => fieldMap[f] ?? f);
  }

  if (Array.isArray(mapped.orderBy)) {
    mapped.orderBy = (mapped.orderBy as string[]).map((expr) => {
      const [field, ...rest] = expr.split(' ');
      const dvField = fieldMap[field] ?? field;
      return rest.length ? `${dvField} ${rest.join(' ')}` : dvField;
    });
  }

  // Map filter identifiers while preserving quoted OData string literals: a
  // quoted `ownerid` inside EqualUserId(PropertyName='ownerid') is a Dataverse
  // property-name argument, not a friendly field reference, and rewriting it
  // would break an otherwise-valid filter.
  if (typeof mapped.filter === 'string') {
    const segments = (mapped.filter as string).split(/('(?:''|[^'])*')/g);
    mapped.filter = segments
      .map((segment, index) => {
        if (index % 2 === 1) return segment;
        let mappedSegment = segment;
        for (const [friendly, dv] of Object.entries(fieldMap)) {
          mappedSegment = mappedSegment.replace(new RegExp(`\\b${friendly}\\b`, 'g'), dv);
        }
        return mappedSegment;
      })
      .join('');
  }

  return mapped as T;
}
