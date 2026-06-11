/**
 * Conversation State layer — pure functions (no React references).
 *
 * Implements the engineering spec at
 * docs/02-architecture/conversation-state-architecture-2026-06-09.html (v1.3).
 *
 * This module is intentionally framework-free so it can be unit tested in
 * isolation (see __tests__/conversation-state.test.ts). It owns:
 *   - ConversationState / FocusEntity / WorkingSet / PendingGoal / StateMutation types (§3, §4.2)
 *   - All behaviour constants (§10) — single source of truth, no magic numbers elsewhere
 *   - normalizeArg + computeArgumentsHash (§5.1)
 *   - hydrateConversationState (§5.2), commitConversationState (§5.3)
 *   - focus decay (§5.4), buildRollingSummary (§5.5)
 */

// ───────────────────────────────────────────────────────────────────────────
// §10 Constants — single source of truth. Do not inline these values elsewhere.
// ───────────────────────────────────────────────────────────────────────────

/** Working set lifetime; past this it is marked stale (still usable for anaphora). */
export const WORKING_SET_TTL_MS = 5 * 60 * 1000;
/** Per-entity working set cap; oldest is evicted when exceeded. */
export const MAX_WORKING_SETS_PER_ENTITY = 3;
/** Per-turn focus confidence multiplier. */
export const FOCUS_DECAY = 0.8;
/** Below this confidence a focus is not used for automatic anaphora. */
export const FOCUS_MIN_CONFIDENCE = 0.5;
/** Initial confidence for a page-bound entity. */
export const FOCUS_INIT_PAGE = 0.9;
/** Initial confidence for a freshly created record (highest — most certain). */
export const FOCUS_INIT_CREATED = 0.95;
/** Initial confidence for an entity surfaced from a query result. */
export const FOCUS_INIT_QUERY = 0.9;
/** Rolling summary character cap; older facts are dropped first. */
export const ROLLING_SUMMARY_MAX_CHARS = 800;
/** P7 bounded-autonomy loop max steps per single user input. */
export const AGENT_LOOP_MAX_STEPS = 5;

// ───────────────────────────────────────────────────────────────────────────
// §3 Type definitions
// ───────────────────────────────────────────────────────────────────────────

export type EntityType = 'account' | 'contact' | 'opportunity' | 'activity';

export type FocusSource = 'page' | 'query-result' | 'user-mention' | 'created-record';

export interface FocusEntity {
  type: EntityType;
  /** Present once resolved to a Dataverse record. */
  id?: string;
  name: string;
  /** 0–1, decays each turn (§5.4). */
  confidence: number;
  source: FocusSource;
  /** Turn index when this focus entered, for decay accounting. */
  turnIntroduced: number;
}

export interface WorkingSetRecord {
  id: string;
  title: string;
  summary?: string;
}

export interface WorkingSet {
  id: string;
  entity: EntityType;
  sourceFunction: string;
  /** §5.1 — the sole basis for reuse decisions. */
  argumentsHash: string;
  /** Human-readable filter description, for display / prompt only. */
  filterSummary: string;
  records: WorkingSetRecord[];
  /**
   * Opaque original result rows (raw Dataverse shape) kept ONLY so a hash-matched
   * reuse (§6) can replay the exact data through the normal display/analysis
   * pipeline without a re-query. Never serialized into prompts.
   */
  rawRecords?: unknown[];
  createdAt: number;
  /** True once past TTL or invalidated by a write. */
  stale: boolean;
}

export type PendingGoalState = 'OPEN' | 'FILLING' | 'READY' | 'COMMITTED' | 'ABORTED';

export interface PendingGoal {
  fn: string;
  state: PendingGoalState;
  requiredSlots: string[];
  filledSlots: Record<string, unknown>;
  nextQuestion?: string;
  turnOpened: number;
}

export interface ConversationState {
  /** Entities in play, sorted by confidence desc. */
  focus: FocusEntity[];
  /** Recent query result-set caches. */
  workingSets: WorkingSet[];
  /** At most one in-flight create/update task. */
  pendingGoal?: PendingGoal;
  /** Compressed summary of history that fell out of the window. */
  rollingSummary: string;
  lastUpdatedAt: number;
}

/**
 * §4.2 — describes what happened this turn. processMessage returns this so it
 * stays pure; commitConversationState applies it to the state.
 */
export interface StateMutation {
  executedFunction?: string;
  executedArgsHash?: string;
  filterSummary?: string;
  resultRecords?: WorkingSetRecord[];
  /** Opaque raw rows kept for reuse replay (§6). Not serialized into prompts. */
  rawResultRecords?: unknown[];
  createdRecord?: { type: EntityType; id: string; name: string };
  resolvedFocus?: FocusEntity[];
  pendingGoal?: PendingGoal | 'CLEAR';
  /** Write operations that should invalidate working sets of these entities. */
  invalidatedEntities?: EntityType[];
  /** Optional note appended to rolling summary (e.g. failure breadcrumb). */
  summaryNote?: string;
}

/** Minimal message shape consumed by hydrate; decoupled from ChatMessage. */
export interface ConversationFact {
  recordList?: { type: EntityType; records: unknown[] };
  createdRecord?: { type: EntityType; name: string };
}

/** Minimal page-context shape consumed by hydrate. */
export interface FocusPageContext {
  entityType?: EntityType;
  entityId?: string;
  entityName?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────────────────────

export function emptyState(): ConversationState {
  return {
    focus: [],
    workingSets: [],
    pendingGoal: undefined,
    rollingSummary: '',
    lastUpdatedAt: Date.now(),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §5.1 normalizeArg + computeArgumentsHash
// ───────────────────────────────────────────────────────────────────────────

/** Parameters that affect the result set per function (excludes limit/sortBy). */
const SIGNIFICANT_ARGS: Record<string, string[]> = {
  queryActivities: ['type', 'accountId', 'dateRange', 'scheduledDate', 'dateFrom', 'dateTo', 'status'],
  queryOpportunities: ['stage', 'accountId', 'minAmount', 'minConfidence', 'maxConfidence', 'closingWithinDays'],
  queryAccounts: ['name', 'region', 'tier'],
  queryContacts: ['accountId', 'name', 'title'],
};

/** Keys treated as enum-like (lowercase + trim + alias mapping). */
const ENUM_KEYS = new Set(['type', 'status', 'stage', 'region', 'tier']);
/** Keys treated as relative date ranges (resolved to a local-day absolute range). */
const DATE_RANGE_KEYS = new Set(['dateRange']);
/** Keys treated as absolute dates (truncated to day). */
const ABSOLUTE_DATE_KEYS = new Set(['scheduledDate', 'dateFrom', 'dateTo']);
/** Keys treated as ids (lowercased GUIDs). */
const ID_KEYS = new Set(['accountId', 'opportunityId', 'contactId', 'activityId']);
/** Keys treated as numeric/amount. */
const NUMERIC_KEYS = new Set(['minAmount', 'maxAmount', 'minConfidence', 'maxConfidence', 'closingWithinDays']);

/** Format a Date as a local YYYY-MM-DD (no timezone shift). */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Truncate an absolute date string/Date to a local YYYY-MM-DD. */
function truncateToDay(value: unknown): string {
  if (value instanceof Date) return localDayKey(value);
  const s = String(value).trim();
  // Already a plain day key
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return localDayKey(d);
  return s.toLowerCase();
}

/** Resolve a relative date-range token to an absolute local-day range. */
function resolveDateRange(value: unknown, now: Date = new Date()): string {
  const token = String(value).trim().toLowerCase();
  const dayStart = (d: Date) => `${localDayKey(d)}T00:00`;
  const dayEnd = (d: Date) => `${localDayKey(d)}T23:59`;
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  switch (token) {
    case 'today':
      return JSON.stringify([dayStart(now), dayEnd(now)]);
    case 'tomorrow': {
      const t = addDays(now, 1);
      return JSON.stringify([dayStart(t), dayEnd(t)]);
    }
    case 'yesterday': {
      const y = addDays(now, -1);
      return JSON.stringify([dayStart(y), dayEnd(y)]);
    }
    case 'this_week':
    case 'thisweek':
    case 'week': {
      // Local week, Monday-based, ISO-ish; deterministic for hashing.
      const dow = (now.getDay() + 6) % 7; // 0 = Monday
      const start = addDays(now, -dow);
      const end = addDays(start, 6);
      return JSON.stringify([dayStart(start), dayEnd(end)]);
    }
    default:
      // Unknown token: keep canonicalised string so identical tokens still match.
      return token;
  }
}

/**
 * §5.1 — normalize a single argument by its key class. Deterministic: identical
 * semantic inputs must produce identical output.
 */
export function normalizeArg(key: string, value: unknown, now: Date = new Date()): unknown {
  if (value === undefined || value === null) return undefined;

  if (DATE_RANGE_KEYS.has(key)) return resolveDateRange(value, now);
  if (ABSOLUTE_DATE_KEYS.has(key)) return truncateToDay(value);
  if (ID_KEYS.has(key)) return String(value).trim().toLowerCase();
  if (ENUM_KEYS.has(key)) return String(value).trim().toLowerCase();
  if (NUMERIC_KEYS.has(key)) return normalizeNumeric(value);
  // name / title and any other free-text fuzzy term
  return String(value).trim().toLowerCase();
}

/** Convert amounts/numbers with unit suffixes to a plain number. */
function normalizeNumeric(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  const raw = String(value).trim().toLowerCase().replace(/[, ]/g, '');
  if (raw === '') return undefined;
  // Chinese units 万 / 亿
  const wan = raw.match(/^([\d.]+)万$/);
  if (wan) return Math.round(parseFloat(wan[1]) * 10000);
  const yi = raw.match(/^([\d.]+)亿$/);
  if (yi) return Math.round(parseFloat(yi[1]) * 100000000);
  // k / m suffixes
  const k = raw.match(/^([\d.]+)k$/);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const mm = raw.match(/^([\d.]+)m$/);
  if (mm) return Math.round(parseFloat(mm[1]) * 1000000);
  const n = parseFloat(raw);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * §5.1 — stable hash of the significant arguments for a query function. Only
 * result-affecting params are included; limit/sortBy are ignored.
 */
export function computeArgumentsHash(
  fn: string,
  args: Record<string, unknown>,
  now: Date = new Date(),
): string {
  const keys = SIGNIFICANT_ARGS[fn] ?? [];
  const norm = keys
    .map((k) => [k, normalizeArg(k, args[k], now)] as const)
    .filter(([, v]) => v !== undefined && v !== '');
  // Sort keys for deterministic ordering regardless of input order.
  norm.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return fn + '|' + JSON.stringify(Object.fromEntries(norm));
}

// ───────────────────────────────────────────────────────────────────────────
// Function classification helpers
// ───────────────────────────────────────────────────────────────────────────

const QUERY_FN_TO_ENTITY: Record<string, EntityType> = {
  queryActivities: 'activity',
  queryOpportunities: 'opportunity',
  queryAccounts: 'account',
  queryContacts: 'contact',
};

export function isQuery(fn: string): boolean {
  return fn in QUERY_FN_TO_ENTITY;
}

export function entityOf(fn: string): EntityType {
  return QUERY_FN_TO_ENTITY[fn] ?? 'activity';
}

// ───────────────────────────────────────────────────────────────────────────
// Focus helpers (§5.4 decay + merge)
// ───────────────────────────────────────────────────────────────────────────

function focusKey(f: FocusEntity): string {
  return `${f.type}:${f.id ?? f.name.trim().toLowerCase()}`;
}

/** Merge focus lists, dedupe by type+id(or name), keep the higher confidence. */
export function mergeFocus(lists: FocusEntity[][]): FocusEntity[] {
  const byKey = new Map<string, FocusEntity>();
  for (const list of lists) {
    for (const f of list) {
      const key = focusKey(f);
      const existing = byKey.get(key);
      if (!existing || f.confidence > existing.confidence) {
        byKey.set(key, existing ? { ...f, confidence: Math.max(f.confidence, existing.confidence) } : f);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
}

/** §5.4 — apply one decay step to existing focus entities. */
export function decayFocus(focus: FocusEntity[]): FocusEntity[] {
  return focus.map((f) => ({ ...f, confidence: f.confidence * FOCUS_DECAY }));
}

function pushFocus(state: ConversationState, f: FocusEntity): void {
  state.focus = mergeFocus([[f], state.focus]);
}

// ───────────────────────────────────────────────────────────────────────────
// §5.5 rollingSummary (heuristic, no LLM)
// ───────────────────────────────────────────────────────────────────────────

const ENTITY_LABEL: Record<EntityType, string> = {
  account: '客户',
  contact: '联系人',
  opportunity: '商机',
  activity: '活动',
};

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    const t = s.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * §5.5 — append business facts from overflow turns to the rolling summary.
 * Template-based, no LLM. Caps length at ROLLING_SUMMARY_MAX_CHARS, keeping the
 * most recent facts.
 */
export function buildRollingSummary(prev: string, overflow: ConversationFact[]): string {
  const facts: string[] = [];
  for (const m of overflow) {
    if (m.recordList) {
      facts.push(`查询${ENTITY_LABEL[m.recordList.type]}：${m.recordList.records.length} 条`);
    }
    if (m.createdRecord) {
      facts.push(`新建${ENTITY_LABEL[m.createdRecord.type]}「${m.createdRecord.name}」`);
    }
  }
  const merged = dedupe(prev ? [prev, ...facts] : facts).join('；');
  return merged.length > ROLLING_SUMMARY_MAX_CHARS
    ? merged.slice(merged.length - ROLLING_SUMMARY_MAX_CHARS)
    : merged;
}

// ───────────────────────────────────────────────────────────────────────────
// §5.2 hydrate (pre-processing rebuild)
// ───────────────────────────────────────────────────────────────────────────

function fromPageContext(pc: FocusPageContext | undefined, turn: number): FocusEntity[] {
  if (!pc?.entityType || !pc.entityName) return [];
  return [
    {
      type: pc.entityType,
      id: pc.entityId,
      name: pc.entityName,
      confidence: FOCUS_INIT_PAGE,
      source: 'page',
      turnIntroduced: turn,
    },
  ];
}

/** Surface a working set that resolved to a single record as a focus candidate. */
function latestSingleEntityAsFocus(workingSets: WorkingSet[], turn: number): FocusEntity[] {
  const out: FocusEntity[] = [];
  const fresh = workingSets.filter((w) => !w.stale).sort((a, b) => b.createdAt - a.createdAt);
  for (const ws of fresh) {
    if (ws.records.length === 1) {
      out.push({
        type: ws.entity,
        id: ws.records[0].id,
        name: ws.records[0].title,
        confidence: FOCUS_INIT_QUERY,
        source: 'query-result',
        turnIntroduced: turn,
      });
      break; // only the most recent single-record set
    }
  }
  return out;
}

export function hydrateConversationState(input: {
  prevState?: ConversationState;
  facts?: ConversationFact[];
  overflowFacts?: ConversationFact[];
  pageContext?: FocusPageContext;
  turn: number;
  now?: number;
}): ConversationState {
  const now = input.now ?? Date.now();
  const base = input.prevState ?? emptyState();
  const state: ConversationState = {
    focus: base.focus.map((f) => ({ ...f })),
    workingSets: base.workingSets.map((w) => ({ ...w, records: [...w.records] })),
    pendingGoal: base.pendingGoal ? { ...base.pendingGoal } : undefined,
    rollingSummary: base.rollingSummary,
    lastUpdatedAt: now,
  };

  // 1. focus: merge page binding + single-record working set + decayed prior focus
  state.focus = mergeFocus([
    fromPageContext(input.pageContext, input.turn),
    latestSingleEntityAsFocus(state.workingSets, input.turn),
    decayFocus(state.focus),
  ]);

  // 2. working set freshness: past TTL -> stale (not deleted)
  state.workingSets.forEach((ws) => {
    if (now - ws.createdAt > WORKING_SET_TTL_MS) ws.stale = true;
  });

  // 3. rolling summary: compress overflow turns (heuristic, no LLM)
  if (input.overflowFacts && input.overflowFacts.length > 0) {
    state.rollingSummary = buildRollingSummary(state.rollingSummary, input.overflowFacts);
  }

  return state;
}

// ───────────────────────────────────────────────────────────────────────────
// §5.3 commit (post-processing write-back)
// ───────────────────────────────────────────────────────────────────────────

function upsertWorkingSet(
  state: ConversationState,
  ws: Omit<WorkingSet, 'id' | 'filterSummary'> & { id?: string; filterSummary?: string },
): void {
  const id = ws.id ?? `ws_${ws.createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  const filterSummary = ws.filterSummary ?? '';
  // Same hash on same function -> overwrite; else append.
  const idx = state.workingSets.findIndex(
    (w) => w.sourceFunction === ws.sourceFunction && w.argumentsHash === ws.argumentsHash,
  );
  const full: WorkingSet = {
    id,
    entity: ws.entity,
    sourceFunction: ws.sourceFunction,
    argumentsHash: ws.argumentsHash,
    filterSummary,
    records: ws.records,
    rawRecords: ws.rawRecords,
    createdAt: ws.createdAt,
    stale: ws.stale,
  };
  if (idx >= 0) {
    full.id = state.workingSets[idx].id; // preserve id on overwrite
    state.workingSets[idx] = full;
  } else {
    state.workingSets.push(full);
  }
  // Cap per entity, evict oldest.
  const sameEntity = state.workingSets
    .filter((w) => w.entity === ws.entity)
    .sort((a, b) => a.createdAt - b.createdAt);
  while (sameEntity.length > MAX_WORKING_SETS_PER_ENTITY) {
    const evict = sameEntity.shift()!;
    state.workingSets = state.workingSets.filter((w) => w.id !== evict.id);
  }
}

export function commitConversationState(
  state: ConversationState,
  m: StateMutation,
  now: number = Date.now(),
): ConversationState {
  const next: ConversationState = {
    focus: state.focus.map((f) => ({ ...f })),
    workingSets: state.workingSets.map((w) => ({ ...w, records: [...w.records] })),
    pendingGoal: state.pendingGoal ? { ...state.pendingGoal } : undefined,
    rollingSummary: state.rollingSummary,
    lastUpdatedAt: now,
  };

  // Query result -> upsert working set (only when records present, i.e. success).
  if (m.executedFunction && isQuery(m.executedFunction) && m.resultRecords) {
    upsertWorkingSet(next, {
      entity: entityOf(m.executedFunction),
      sourceFunction: m.executedFunction,
      argumentsHash: m.executedArgsHash ?? computeArgumentsHash(m.executedFunction, {}, new Date(now)),
      filterSummary: m.filterSummary ?? '',
      records: m.resultRecords,
      rawRecords: m.rawResultRecords,
      createdAt: now,
      stale: false,
    });
  }

  // Write op -> invalidate related working sets.
  (m.invalidatedEntities ?? []).forEach((e) => {
    next.workingSets.filter((w) => w.entity === e).forEach((w) => (w.stale = true));
  });

  // Created record -> high-confidence focus.
  if (m.createdRecord) {
    pushFocus(next, {
      type: m.createdRecord.type,
      id: m.createdRecord.id,
      name: m.createdRecord.name,
      confidence: FOCUS_INIT_CREATED,
      source: 'created-record',
      turnIntroduced: 0,
    });
  }

  // Resolved focus from anaphora.
  if (m.resolvedFocus && m.resolvedFocus.length > 0) {
    next.focus = mergeFocus([m.resolvedFocus, next.focus]);
  }

  // Pending goal transitions.
  if (m.pendingGoal === 'CLEAR') {
    next.pendingGoal = undefined;
  } else if (m.pendingGoal) {
    next.pendingGoal = m.pendingGoal;
  }

  // Failure breadcrumb / fact note.
  if (m.summaryNote) {
    next.rollingSummary = buildRollingSummary(next.rollingSummary, []);
    const merged = dedupe([next.rollingSummary, m.summaryNote]).join('；');
    next.rollingSummary =
      merged.length > ROLLING_SUMMARY_MAX_CHARS ? merged.slice(merged.length - ROLLING_SUMMARY_MAX_CHARS) : merged;
  }

  return next;
}

// ───────────────────────────────────────────────────────────────────────────
// §9 serializeStateForPrompt — plain text (no JSON output mode dependency)
// ───────────────────────────────────────────────────────────────────────────

export function serializeStateForPrompt(state: ConversationState): string {
  const lines: string[] = [];
  const activeFocus = state.focus.filter((f) => f.confidence >= FOCUS_MIN_CONFIDENCE).slice(0, 4);
  if (activeFocus.length > 0) {
    lines.push(
      '[Focus] ' +
        activeFocus
          .map((f) => `${f.type} "${f.name}"${f.id ? ` (id=${f.id})` : ''}`)
          .join(', '),
    );
  }
  const freshSets = state.workingSets.filter((w) => !w.stale);
  for (const ws of freshSets.slice(0, 3)) {
    lines.push(
      `[Working set] ${ws.sourceFunction}${ws.filterSummary ? ` · ${ws.filterSummary}` : ''} · ${ws.records.length} records · ${ws.stale ? 'stale' : 'fresh'}`,
    );
  }
  if (state.pendingGoal && state.pendingGoal.state !== 'COMMITTED' && state.pendingGoal.state !== 'ABORTED') {
    const missing = state.pendingGoal.requiredSlots.filter((s) => !(s in state.pendingGoal!.filledSlots));
    lines.push(`[Pending goal] ${state.pendingGoal.fn}${missing.length ? ` — missing: ${missing.join(', ')}` : ' — ready'}`);
  }
  if (state.rollingSummary) {
    lines.push(`[Summary] ${state.rollingSummary}`);
  }
  return lines.join('\n');
}
