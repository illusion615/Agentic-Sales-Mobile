/**
 * Shared adapter utilities for mapping between
 * Dataverse column names/types and app-facing friendly types.
 */

const CHOICE_BASE = 995340000;

/** Convert DV choice integer (995340000-based) → friendly key string like 'TierKey0' */
export function dvToKey(prefix: string, dv: number | undefined | null): string | undefined {
  return dv != null ? `${prefix}${dv - CHOICE_BASE}` : undefined;
}

/** Convert friendly key string like 'TierKey0' → DV choice integer */
export function keyToDv(key: string | undefined | null): number | undefined {
  if (!key) return undefined;
  const m = key.match(/(\d+)$/);
  return m ? CHOICE_BASE + Number(m[1]) : undefined;
}

/** Safely parse a DV string as number, returning undefined if not a valid number */
export function dvNum(val: string | undefined | null): number | undefined {
  if (val == null || val === '') return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

/** Convert number → string for DV, undefined-safe */
export function numToDv(val: number | undefined | null): string | undefined {
  return val != null ? String(val) : undefined;
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
 * Map query options (select/orderBy/filter) from friendly field names to DV column names.
 * The fieldMap maps friendly names → DV names.
 */
export function mapOptions(
  opts: Record<string, unknown> | undefined,
  fieldMap: Record<string, string>
): Record<string, unknown> | undefined {
  if (!opts) return opts;
  const mapped = { ...opts };

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
