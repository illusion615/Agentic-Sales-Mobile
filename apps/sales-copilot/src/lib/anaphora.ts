/**
 * Anaphora resolution — pure function (§7).
 *
 * Resolves referring expressions ("它 / 这个客户 / 第一个 / 他们") to a concrete
 * entity (or a list of candidates requiring a follow-up question) using
 * deterministic rules first. The LLM is only consulted when rules cannot decide,
 * and then with an explicit candidate set.
 *
 * Output is traceable: it records which rule fired and what it resolved to, for
 * display in the Frame Inspector.
 */

import {
  FOCUS_MIN_CONFIDENCE,
  type ConversationState,
  type EntityType,
  type FocusEntity,
  type WorkingSet,
  type WorkingSetRecord,
} from './conversation-state';

export type AnaphoraKind =
  | 'singular' // 它 / 这个 / 那个
  | 'ordinal' // 第一个 / 第 N 个 / 最贵的那个
  | 'plural'; // 他们 / 这些

export interface AnaphoraRequest {
  kind: AnaphoraKind;
  /** Explicit entity type when the phrase makes it clear ("这个客户" -> account). */
  entityType?: EntityType;
  /** For ordinal: 1-based index, or a superlative dimension. */
  ordinal?: number;
  superlative?: { field: 'amount' | 'confidence'; direction: 'max' | 'min' };
}

export type AnaphoraResult =
  | { status: 'resolved'; rule: string; entity: FocusEntity }
  | { status: 'resolved-set'; rule: string; workingSetId: string; records: WorkingSetRecord[] }
  | { status: 'ambiguous'; rule: string; candidates: FocusEntity[] }
  | { status: 'needs-requery'; rule: string; reason: string }
  | { status: 'none'; rule: string };

function activeFocus(state: ConversationState, type?: EntityType): FocusEntity[] {
  return state.focus
    .filter((f) => f.confidence >= FOCUS_MIN_CONFIDENCE && (!type || f.type === type))
    .sort((a, b) => b.confidence - a.confidence);
}

function latestWorkingSet(state: ConversationState, type?: EntityType): WorkingSet | undefined {
  return state.workingSets
    .filter((w) => !type || w.entity === type)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

function focusFromRecord(type: EntityType, rec: WorkingSetRecord): FocusEntity {
  return {
    type,
    id: rec.id,
    name: rec.title,
    confidence: 0.9,
    source: 'query-result',
    turnIntroduced: 0,
  };
}

export function resolveAnaphora(state: ConversationState, req: AnaphoraRequest): AnaphoraResult {
  // ── Ordinal / superlative: index into the most recent working set ──────────
  if (req.kind === 'ordinal') {
    const ws = latestWorkingSet(state, req.entityType);
    if (!ws) return { status: 'none', rule: 'ordinal/no-working-set' };
    if (ws.stale) {
      return { status: 'needs-requery', rule: 'ordinal/stale-working-set', reason: ws.id };
    }
    if (typeof req.ordinal === 'number') {
      const idx = req.ordinal - 1;
      const rec = ws.records[idx];
      if (!rec) return { status: 'none', rule: 'ordinal/out-of-range' };
      return { status: 'resolved', rule: 'ordinal/index', entity: focusFromRecord(ws.entity, rec) };
    }
    // superlative requires the caller to have sorted records; take first.
    if (ws.records.length === 0) return { status: 'none', rule: 'ordinal/empty' };
    return { status: 'resolved', rule: 'ordinal/superlative', entity: focusFromRecord(ws.entity, ws.records[0]) };
  }

  // ── Plural: the whole most-recent working set (set-level reference) ─────────
  if (req.kind === 'plural') {
    const ws = latestWorkingSet(state, req.entityType);
    if (!ws) return { status: 'none', rule: 'plural/no-working-set' };
    return { status: 'resolved-set', rule: 'plural/working-set', workingSetId: ws.id, records: ws.records };
  }

  // ── Singular with explicit type ────────────────────────────────────────────
  if (req.entityType) {
    const typed = activeFocus(state, req.entityType);
    if (typed.length >= 1) {
      return { status: 'resolved', rule: 'singular/typed-focus', entity: typed[0] };
    }
    // fall back to a single-record working set of that type
    const ws = latestWorkingSet(state, req.entityType);
    if (ws && !ws.stale && ws.records.length === 1) {
      return { status: 'resolved', rule: 'singular/typed-single-record', entity: focusFromRecord(ws.entity, ws.records[0]) };
    }
    if (ws && ws.records.length > 1) {
      return {
        status: 'ambiguous',
        rule: 'singular/typed-multi-record',
        candidates: ws.records.map((r) => focusFromRecord(ws.entity, r)),
      };
    }
    return { status: 'none', rule: 'singular/typed-none' };
  }

  // ── Singular, type unclear (§7 row 2 — the hard case, deterministic) ────────
  const all = activeFocus(state);
  if (all.length === 0) return { status: 'none', rule: 'singular/untyped-none' };
  if (all.length === 1) {
    return { status: 'resolved', rule: 'singular/untyped-single', entity: all[0] };
  }
  // Multiple: take the unique highest-confidence one.
  const top = all[0];
  const tiedTop = all.filter((f) => f.confidence === top.confidence);
  if (tiedTop.length === 1) {
    return { status: 'resolved', rule: 'singular/untyped-unique-max', entity: top };
  }
  // Tie at the top -> ask the user.
  return { status: 'ambiguous', rule: 'singular/untyped-tie', candidates: tiedTop };
}
