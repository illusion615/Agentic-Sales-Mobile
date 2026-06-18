import { withRetry } from '@/lib/retry';

/**
 * Shared adapter utilities for mapping between
 * Dataverse column names/types and app-facing friendly types.
 */

const CHOICE_BASE = 995340000;

/**
 * Guard for mutation/read ops: refuse to forward an empty id to the generated
 * Crf5c_*Service layer.
 */
export function requireId(id: string | undefined | null, op: string, entity: string): asserts id is string {
  if (!id) {
    const err = new Error(`${entity}Service.${op}() called with empty id`);
    (err as Error & { agentErrorType: string; agentErrorContext: Record<string, unknown> }).agentErrorType = 'validation';
    (err as Error & { agentErrorContext: Record<string, unknown> }).agentErrorContext = { op, entity };
    throw err;
  }
}

/**
 * Strict contract guard for Dataverse create. The Power Apps SDK is typed
 * (`createRecordAsync<TReq, TRes>` → `IOperationResult<TRes>`) and the
 * generated `TRes` (e.g. `Crf5c_aisummaries`) declares the PK column as a
 * required string. If `success === true` but the PK isn't echoed under its
 * canonical name, the contract is broken — almost certainly an upstream cause
 * (table not deployed to this environment, user lacks Read after Create,
 * or a required field was rejected and the SDK swallowed the error). We
 * surface that immediately with diagnostics instead of papering over it.
 */
export function requireCreated<T>(
  data: T | undefined | null,
  pkField: keyof T,
  entity: string
): T {
  const pk = String(pkField);
  if (!data || typeof data !== 'object') {
    const err = new Error(
      `Dataverse create for ${entity} returned success but no row body (expected PK ${pk}).`
    );
    (err as Error & { agentErrorType: string; agentErrorContext: Record<string, unknown> }).agentErrorType = 'dataverse';
    (err as Error & { agentErrorContext: Record<string, unknown> }).agentErrorContext = { entity, pk, cause: 'no_row_body' };
    throw err;
  }
  const row = data as Record<string, unknown>;
  const pkValue = row[pk];
  if (typeof pkValue === 'string' && pkValue) return data;

  const keys = Object.keys(row);
  const err = new Error(
    `Dataverse create for ${entity} returned a row without its primary key (expected ${pk}). Row keys: [${keys.join(', ') || '<empty>'}].`
  );
  (err as Error & { agentErrorType: string; agentErrorContext: Record<string, unknown> }).agentErrorType = 'dataverse';
  (err as Error & { agentErrorContext: Record<string, unknown> }).agentErrorContext = { entity, pk, returnedKeys: keys, cause: 'pk_missing' };
  throw err;
}

/**
 * Best-effort ID extractor for Dataverse create results.
 *
 * The Power Apps SDK `createRecordAsync` behaves differently between runtimes:
 *   - Browser dev mode (npx power-apps run): returns full row with PK field
 *   - Power Apps hosted: may return `{ success: true, data: undefined }` because
 *     Dataverse returns 204 No Content (no `Prefer: return=representation` header)
 *
 * This function tries multiple strategies and returns undefined if none work,
 * instead of throwing — letting the caller handle the missing-ID case
 * (typically via a read-back query).
 */
export function extractCreatedId<T>(
  data: T | undefined | null,
  pkField: keyof T & string,
  _entity: string,
): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const row = data as Record<string, unknown>;
  // Strategy 1: PK field by its canonical column name
  const pkValue = row[pkField];
  if (typeof pkValue === 'string' && pkValue) return pkValue;
  // Strategy 2: generic 'id' field (some SDK versions)
  const genericId = row['id'];
  if (typeof genericId === 'string' && genericId) return genericId;
  return undefined;
}

/**
 * Resilient create-and-return pattern for Dataverse.
 *
 * 1. Calls `createFn(dvPayload)` → if response data has PK, return it.
 * 2. If hosted Power Apps SDK returns no data (204 No Content), do a read-back
 *    query using `getAllFn` with the caller-provided filter to find the
 *    just-created record.
 * 3. If read-back also fails, throw with a diagnostic error.
 *
 * Usage in each service:
 *   return createWithReadback(
 *     (p) => Crf5c_XxxService.create(p),
 *     (o) => Crf5c_XxxService.getAll(o),
 *     dvPayload, 'crf5c_xxxid', 'Xxx',
 *     `crf5c_somefield eq '${record.someField}'`,
 *     fromDv,
 *   );
 */
export async function createWithReadback<TDv, TApp>(
  createFn: (payload: Record<string, unknown>) => Promise<{ success: boolean; data: TDv; error?: unknown }>,
  getAllFn: (opts: { filter: string; orderBy: string[]; top: number }) => Promise<{ success: boolean; data: TDv[] | null | undefined; error?: unknown }>,
  dvPayload: Record<string, unknown>,
  pkField: string,
  entity: string,
  readbackFilter: string,
  mapFn: (row: TDv) => TApp,
): Promise<TApp> {
  const result = await createFn(dvPayload);
  if (!result.success) throw result.error;

  // Best case: SDK returned the full row with PK (browser dev mode)
  if (result.data && typeof result.data === 'object') {
    const pk = (result.data as Record<string, unknown>)[pkField];
    if (typeof pk === 'string' && pk) return mapFn(result.data);
  }

  // Hosted Power Apps: create succeeded but no data body (204 No Content).
  // Read back the just-created record with retry (Dataverse eventual consistency).
  console.warn(`[${entity}] createRecordAsync returned no data body — reading back via getAll`);
  const readback = await withRetry(
    () => getAllFn({ filter: readbackFilter, orderBy: ['createdon desc'], top: 1 }),
    { attempts: 3, backoffMs: 300, jitterMs: 200 },
  );
  if (readback.success && readback.data && readback.data.length > 0) {
    return mapFn(readback.data[0]);
  }

  throw new Error(
    `Dataverse create for ${entity} succeeded but could not read back the record. ` +
    `Filter used: ${readbackFilter}. This may indicate a Read permission issue on the table.`
  );
}

/**
 * Convert a friendly choice label (e.g. 'prospecting', '正常') to the Dataverse
 * choice integer using the SDK-generated KeyToLabel map.
 */
export function labelToDv(
  keyToLabel: Readonly<Record<string, string>>,
  label: string | undefined | null
): number | undefined {
  if (label == null || label === '') return undefined;
  for (const [k, v] of Object.entries(keyToLabel)) {
    if (v === label) {
      const m = k.match(/(\d+)$/);
      if (m) return CHOICE_BASE + Number(m[1]);
    }
  }
  return undefined;
}

const ODATA_FV = '@OData.Community.Display.V1.FormattedValue';

/**
 * Read a choice column from a raw DV row. The Power Apps SDK's
 * `retrieveMultipleRecordsAsync` returns rows in their raw OData shape and
 * does NOT project `@FormattedValue` annotations into typed `<col>name`
 * fields — only `get`/`create` sometimes do. So `dv.<col>name` alone yields
 * '' on list queries and silently breaks any UI keyed on the label.
 *
 * Resolution order: (1) OData FormattedValue annotation, (2) numeric → label
 * via the generated map, (3) the optional SDK-projected `<col>name` field.
 */
export function dvChoice<TMap extends Readonly<Record<number, string>>>(
  dv: Record<string, unknown>,
  colName: string,
  numericMap: TMap,
): string {
  const fv = dv[colName + ODATA_FV];
  if (typeof fv === 'string' && fv) return fv;
  const raw = dv[colName];
  if (raw != null && raw !== '') {
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!isNaN(num)) {
      const label = (numericMap as Record<number, string>)[num];
      if (label) return label;
    }
  }
  const name = dv[colName + 'name'];
  return typeof name === 'string' ? name : '';
}

/**
 * Read a lookup column's display name from a raw DV row. Lookups expose
 * the GUID at `_<col>_value` and the formatted name at
 * `_<col>_value@OData.Community.Display.V1.FormattedValue`. The Power Apps
 * SDK does not project this into the typed `<col>name` field on list
 * responses, so reading `dv.<col>name` alone yields '' for any lookup
 * nested inside a list query result.
 */
export function dvLookupName(dv: Record<string, unknown>, valueField: string): string {
  const fv = dv[valueField + ODATA_FV];
  return typeof fv === 'string' ? fv : '';
}

/** Safely parse a DV string as number, returning undefined if not a valid number */
export function dvNum(val: string | undefined | null): number | undefined {
  if (val == null || val === '') return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

/**
 * Convert number → DV payload value, undefined-safe.
 * Dataverse OData rejects string values for Edm.Decimal/Edm.Int when the
 * service runs with IEEE754Compatible=false (default), so we keep it numeric.
 * The PAC-generated TS types declare these columns as `string`, but that is
 * incorrect at the wire level — toDv() casts to any.
 */
export function numToDv(val: number | undefined | null): number | undefined {
  return val != null ? Number(val) : undefined;
}

/** Build a lookup object from DV _xxx_value GUID + formatted name */
export function dvLookup(
  dv: Record<string, unknown>,
  valueField: string,
  nameField: string
): { id: string; [key: string]: string } | undefined {
  const id = dv[valueField] as string | undefined;
  if (!id) return undefined;
  const name = (dv[nameField] as string) ?? '';
  return { id, name };
}

/** Build @odata.bind string for a Dataverse lookup write */
export function lookupBind(entitySet: string, id: string | undefined): string | null {
  return id ? `/${entitySet}(${id})` : null;
}

/**
 * AND a `statecode eq 0` (Active) clause into a query's filter so soft-deleted /
 * deactivated rows are never read. Use for entities where Inactive means
 * "removed" (Setting, Account, Contact). Do NOT use for Activity/Opportunity,
 * where Inactive is a legitimate business state (completed / closed) that must
 * still be read.
 *
 * Apply AFTER `mapOptions` so the existing filter is already in DV column names —
 * `statecode` is the real Dataverse column on every table, so it passes through
 * unchanged. Any caller-supplied filter is parenthesised then ANDed.
 */
export function withActiveState(
  opts: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = (opts ?? {}) as Record<string, unknown>;
  const existing = typeof base.filter === 'string' ? base.filter.trim() : '';
  const activeClause = 'statecode eq 0';
  const filter = existing ? `(${existing}) and ${activeClause}` : activeClause;
  return { ...base, filter };
}

/**
 * Map query options (select/orderBy/filter) from friendly field names to DV column names.
 * The fieldMap maps friendly names → DV names.
 */
export function mapOptions(
  opts: Record<string, unknown> | { filter?: string; orderBy?: string[]; top?: number; select?: string[] } | undefined,
  fieldMap: Record<string, string>
): Record<string, unknown> | undefined {
  if (!opts) return opts;
  const mapped = { ...opts } as Record<string, unknown>;

  // Map select field names
  if (Array.isArray(mapped.select)) {
    mapped.select = (mapped.select as string[]).map(f => fieldMap[f] ?? f);
  }

  // Map orderBy field names (format: "fieldName asc/desc")
  if (Array.isArray(mapped.orderBy)) {
    mapped.orderBy = (mapped.orderBy as string[]).map(expr => {
      const [field, ...rest] = expr.split(' ');
      const dvField = fieldMap[field] ?? field;
      return rest.length ? `${dvField} ${rest.join(' ')}` : dvField;
    });
  }

  // Map filter: replace known friendly names with DV names
  if (typeof mapped.filter === 'string') {
    let f = mapped.filter as string;
    for (const [friendly, dv] of Object.entries(fieldMap)) {
      // Word-boundary replacement to avoid partial matches
      f = f.replace(new RegExp(`\\b${friendly}\\b`, 'g'), dv);
    }
    mapped.filter = f;
  }

  return mapped;
}
