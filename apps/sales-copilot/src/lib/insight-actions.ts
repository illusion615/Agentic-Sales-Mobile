/**
 * InsightAction — the structured, actionable half of an AI insight.
 *
 * The entity insight (generateEntityInsight skill) returns a narrative plus a
 * SMALL set of high-conviction next actions, each with a concrete explanation.
 * This module is the single normalize/parse boundary: the insight trigger
 * normalizes raw model output before storing it (as JSON in AISummary.actionItems),
 * and AISummaryCard parses it back for rendering. Keeping both sides on one
 * validator means the stored shape and the rendered shape never drift.
 */
export type InsightActionType = 'visit' | 'call' | 'meeting' | 'email';

export interface InsightAction {
  title: string;
  /** One sentence: WHY this action now, tied to a concrete fact. Never generic. */
  explanation: string;
  type: InsightActionType;
  /** Days from today the action should happen (1–30). */
  dueInDays: number;
}

const VALID_TYPES: ReadonlySet<string> = new Set(['visit', 'call', 'meeting', 'email']);

/** Coerce/validate raw model actions into a capped, clean InsightAction[]. */
export function normalizeInsightActions(raw: unknown): InsightAction[] {
  if (!Array.isArray(raw)) return [];
  const out: InsightAction[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!title) continue;
    let type = typeof o.type === 'string' ? o.type.toLowerCase().trim() : 'call';
    if (!VALID_TYPES.has(type)) type = 'call';
    const explanation = typeof o.explanation === 'string' ? o.explanation.trim() : '';
    let due = typeof o.dueInDays === 'number' ? Math.round(o.dueInDays) : 3;
    if (!Number.isFinite(due) || due < 1) due = 3;
    if (due > 30) due = 30;
    out.push({ title, explanation, type: type as InsightActionType, dueInDays: due });
    if (out.length >= 3) break; // judicious: quality over quantity, hard cap
  }
  return out;
}

/** Parse the JSON string stored in AISummary.actionItems back into actions. */
export function parseInsightActions(json: string | undefined | null): InsightAction[] {
  if (!json || !json.trim().startsWith('[')) return [];
  try {
    return normalizeInsightActions(JSON.parse(json));
  } catch {
    return [];
  }
}
