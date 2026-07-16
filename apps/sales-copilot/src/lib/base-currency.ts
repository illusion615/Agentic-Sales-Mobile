/**
 * Transaction-currency catalog, sourced dynamically from Dataverse
 * `transactioncurrency` — never hardcoded. The environment base currency is the
 * reference currency (exchange rate 1); every opportunity amount's base value is
 * computed natively by Dataverse (`crf5c_amount_base`). This module exposes the
 * base-currency symbol (for base-currency display / roll-ups) and a per-currency
 * symbol lookup, kept as module state so the pure `format-currency` helpers can
 * read it synchronously without threading it through every call site.
 */
export interface CurrencyInfo {
  id: string;
  symbol: string;
  iso: string;
  name: string;
  rate: number;
}

let baseSymbol = '$';
let baseId = '';
let byId: Record<string, CurrencyInfo> = {};

/** localStorage key for the user's preferred opportunity transaction currency. */
const PREF_KEY = 'opportunity-currency-pref';

/** Symbol of the environment base currency (base-currency display / roll-ups). */
export function getBaseCurrencySymbol(): string {
  return baseSymbol;
}

/** Id of the environment base currency. */
export function getBaseCurrencyId(): string {
  return baseId;
}

/** Symbol of a specific transaction currency by id; falls back to the base symbol. */
export function getCurrencySymbol(id?: string): string {
  return (id && byId[id]?.symbol) || baseSymbol;
}

/** All known currencies (for pickers). */
export function getCurrencyCatalog(): CurrencyInfo[] {
  return Object.values(byId);
}

/**
 * The user's preferred opportunity currency id — the currency they last chose for
 * an opportunity, independent of the environment base currency. Falls back to the
 * base currency when the user has not chosen one yet.
 */
export function getPreferredCurrencyId(): string {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v && byId[v]) return v;
  } catch { /* ignore */ }
  return baseId;
}

/** Remember the user's chosen opportunity currency for future drafts. */
export function setPreferredCurrencyId(id: string): void {
  try { localStorage.setItem(PREF_KEY, id); } catch { /* ignore */ }
}

/** Populate the catalog from the Dataverse currency list and derive the base symbol. */
export function setCurrencyCatalog(list: CurrencyInfo[]): void {
  const next: Record<string, CurrencyInfo> = {};
  for (const c of list) if (c.id) next[c.id] = c;
  byId = next;
  // Base currency = the reference currency (exchange rate 1). Fall back to the first row.
  const base = list.find((c) => c.rate === 1) ?? list[0];
  if (base?.symbol) baseSymbol = base.symbol;
  if (base?.id) baseId = base.id;
}
