/**
 * In-memory implementation of the platform IDataClient.
 *
 * Mirrors the Power Apps `app-gen-sdk/data` contract:
 *   - createRecordAsync, updateRecordAsync, deleteRecordAsync
 *   - retrieveRecordAsync, retrieveMultipleRecordsAsync
 *
 * Backed by sample data (auto-seeded on first read) and persisted to
 * localStorage so changes survive reloads.  No Dataverse, no MSAL.
 */

import type {
  IDataClient,
  IOperationOptions,
  IOperationResult,
} from './common/types';
import {
  sampleAccounts,
  sampleContacts,
  sampleOpportunities,
  sampleActivities,
  sampleTasks,
} from '@/data/sample-data';

type Row = Record<string, unknown> & { id: string };

const STORAGE_PREFIX = 'shim-data:';
const SOURCES_LIST_KEY = `${STORAGE_PREFIX}__sources`;

// Map of Power Apps `dataSource` name → seed data and id-prefix for new records.
const SEEDS: Record<string, { rows: Row[]; idPrefix: string }> = {
  Account: { rows: sampleAccounts as unknown as Row[], idPrefix: 'acc' },
  Contact: { rows: sampleContacts as unknown as Row[], idPrefix: 'ctc' },
  Opportunity: { rows: sampleOpportunities as unknown as Row[], idPrefix: 'opp' },
  Activity: { rows: sampleActivities as unknown as Row[], idPrefix: 'act' },
  Task: { rows: sampleTasks as unknown as Row[], idPrefix: 'tsk' },
  // Sources for which there is no curated seed yet — start empty.
  Briefing: { rows: [], idPrefix: 'brf' },
  Signal: { rows: [], idPrefix: 'sig' },
  BusinessInsight: { rows: [], idPrefix: 'ins' },
  CopilotConversation: { rows: [], idPrefix: 'conv' },
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function storageKey(source: string): string {
  return `${STORAGE_PREFIX}${source}`;
}

function loadSource(source: string): Row[] {
  if (!isBrowser()) return cloneSeed(source);
  const raw = window.localStorage.getItem(storageKey(source));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Row[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to seed */
    }
  }
  const seeded = cloneSeed(source);
  saveSource(source, seeded);
  return seeded;
}

function cloneSeed(source: string): Row[] {
  const seed = SEEDS[source];
  if (!seed) return [];
  return seed.rows.map((r) => ({ ...r }));
}

function saveSource(source: string, rows: Row[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(source), JSON.stringify(rows));
  // Track sources we've ever touched for debugging / reset.
  try {
    const list = JSON.parse(
      window.localStorage.getItem(SOURCES_LIST_KEY) || '[]'
    ) as string[];
    if (!list.includes(source)) {
      list.push(source);
      window.localStorage.setItem(SOURCES_LIST_KEY, JSON.stringify(list));
    }
  } catch {
    /* ignore */
  }
}

function generateId(source: string): string {
  const prefix = SEEDS[source]?.idPrefix ?? source.toLowerCase();
  // Keep ids short and human-readable for in-memory mode; not a UUID.
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}${rand}`;
}

// ---------- minimal OData-ish filter / sort ----------

type Comparator = '=' | '!=' | '>' | '>=' | '<' | '<=';

interface Cmp {
  field: string;
  op: Comparator;
  value: string | number | boolean | null;
}

interface AndExpr { kind: 'and'; parts: Expr[] }
interface OrExpr { kind: 'or'; parts: Expr[] }
interface CmpExpr { kind: 'cmp'; cmp: Cmp }
type Expr = AndExpr | OrExpr | CmpExpr;

const OP_MAP: Record<string, Comparator> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  ge: '>=',
  lt: '<',
  le: '<=',
};

function parseLiteral(token: string): string | number | boolean | null {
  if (token === 'null') return null;
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1).replace(/''/g, "'");
  }
  const n = Number(token);
  if (!Number.isNaN(n)) return n;
  return token; // last-resort: treat as string
}

function tokenize(filter: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < filter.length) {
    const c = filter[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '(' || c === ')') { out.push(c); i++; continue; }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < filter.length) {
        if (filter[j] === quote && filter[j + 1] === quote) { j += 2; continue; }
        if (filter[j] === quote) break;
        j++;
      }
      out.push(filter.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < filter.length && !' \t()'.includes(filter[j])) j++;
    out.push(filter.slice(i, j));
    i = j;
  }
  return out;
}

function parseFilter(filter: string): Expr | null {
  const tokens = tokenize(filter);
  let pos = 0;

  const parseCmp = (): Expr => {
    const field = tokens[pos++];
    const opTok = tokens[pos++];
    const valTok = tokens[pos++];
    const op = OP_MAP[opTok?.toLowerCase()];
    if (!field || !op) return { kind: 'cmp', cmp: { field: field ?? '', op: '=', value: null } };
    return { kind: 'cmp', cmp: { field, op, value: parseLiteral(valTok ?? 'null') } };
  };

  const parsePrimary = (): Expr => {
    if (tokens[pos] === '(') {
      pos++;
      const e = parseOr();
      if (tokens[pos] === ')') pos++;
      return e;
    }
    return parseCmp();
  };

  const parseAnd = (): Expr => {
    let left = parsePrimary();
    while (tokens[pos]?.toLowerCase() === 'and') {
      pos++;
      const right = parsePrimary();
      left = { kind: 'and', parts: [left, right] };
    }
    return left;
  };

  const parseOr = (): Expr => {
    let left = parseAnd();
    while (tokens[pos]?.toLowerCase() === 'or') {
      pos++;
      const right = parseAnd();
      left = { kind: 'or', parts: [left, right] };
    }
    return left;
  };

  if (tokens.length === 0) return null;
  return parseOr();
}

function compare(a: unknown, b: unknown, op: Comparator): boolean {
  if (op === '=') return a === b;
  if (op === '!=') return a !== b;
  if (typeof a === 'number' && typeof b === 'number') {
    if (op === '>') return a > b;
    if (op === '>=') return a >= b;
    if (op === '<') return a < b;
    if (op === '<=') return a <= b;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (op === '>') return a > b;
    if (op === '>=') return a >= b;
    if (op === '<') return a < b;
    if (op === '<=') return a <= b;
  }
  return false;
}

function evalExpr(row: Row, expr: Expr): boolean {
  if (expr.kind === 'and') return expr.parts.every((p) => evalExpr(row, p));
  if (expr.kind === 'or') return expr.parts.some((p) => evalExpr(row, p));
  const { field, op, value } = expr.cmp;
  return compare(row[field], value, op);
}

function applyOptions(rows: Row[], opts?: IOperationOptions): Row[] {
  let out = rows;
  if (opts?.filter) {
    const expr = parseFilter(opts.filter);
    if (expr) out = out.filter((r) => evalExpr(r, expr));
  }
  if (opts?.orderBy?.length) {
    const directives = opts.orderBy.map((s) => {
      const [field, dir = 'asc'] = s.trim().split(/\s+/);
      return { field, asc: dir.toLowerCase() !== 'desc' };
    });
    out = [...out].sort((a, b) => {
      for (const { field, asc } of directives) {
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        if (av === undefined || av === null) return asc ? -1 : 1;
        if (bv === undefined || bv === null) return asc ? 1 : -1;
        const cmp = (av as never) < (bv as never) ? -1 : (av as never) > (bv as never) ? 1 : 0;
        if (cmp !== 0) return asc ? cmp : -cmp;
      }
      return 0;
    });
  }
  if (opts?.top && opts.top > 0) out = out.slice(0, opts.top);
  return out;
}

// ---------- Client implementation ----------

const client: IDataClient = {
  async createRecordAsync(source, record) {
    try {
      const rows = loadSource(source);
      const id = (record as { id?: string }).id || generateId(source);
      const newRow: Row = { ...(record as Row), id };
      rows.push(newRow);
      saveSource(source, rows);
      return { success: true, data: newRow as never };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  },

  async updateRecordAsync(source, id, changedFields) {
    try {
      const rows = loadSource(source);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) {
        return { success: false, error: new Error(`${source} not found: ${id}`) };
      }
      const updated: Row = { ...rows[idx], ...(changedFields as Row), id };
      rows[idx] = updated;
      saveSource(source, rows);
      return { success: true, data: updated as never };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  },

  async deleteRecordAsync(source, id) {
    try {
      const rows = loadSource(source);
      const next = rows.filter((r) => r.id !== id);
      saveSource(source, next);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  },

  async retrieveRecordAsync(source, id) {
    try {
      const rows = loadSource(source);
      const found = rows.find((r) => r.id === id);
      if (!found) {
        return { success: false, error: new Error(`${source} not found: ${id}`) };
      }
      return { success: true, data: found as never };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  },

  async retrieveMultipleRecordsAsync(source, options) {
    try {
      const rows = loadSource(source);
      const result = applyOptions(rows, options);
      return { success: true, data: result as never };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  },
};

export function getClient(): IDataClient {
  return client;
}

/** Wipe the in-memory store (clears localStorage seeds). */
export function resetShimData(): void {
  if (!isBrowser()) return;
  try {
    const list = JSON.parse(
      window.localStorage.getItem(SOURCES_LIST_KEY) || '[]'
    ) as string[];
    for (const s of list) window.localStorage.removeItem(storageKey(s));
    window.localStorage.removeItem(SOURCES_LIST_KEY);
  } catch {
    /* ignore */
  }
}

export type { IOperationOptions, IOperationResult, IDataClient } from './common/types';
