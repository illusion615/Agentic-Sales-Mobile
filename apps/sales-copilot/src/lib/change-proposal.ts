/**
 * Change proposal — the shape a "propose → confirm → apply" flow carries.
 *
 * A reason step (proposeChanges) reads the relevant records, decides the
 * concrete writes, and emits a ChangeProposal. The proposal rides inside the
 * confirm-card message (NOT the queue's flat resolvedContext), so it can hold
 * arbitrary structured data. On user confirm, `applyProposal` runs each write
 * in order.
 *
 * SAFETY: applyProposal will only execute functions on an explicit write
 * allowlist. A malformed / adversarial proposal therefore cannot be coerced
 * into calling a query, a draft, or any non-write function.
 */

export interface ProposedWrite {
  /** Write function name, e.g. 'updateActivity' | 'deleteActivity'. */
  fn: string;
  /** Concrete arguments (must include the target record's id — never a name). */
  args: Record<string, unknown>;
  /** Human-facing label for this change, in the user's selected language. */
  label: string;
}

/**
 * Generative preview — structured data sections the frontend renders above the
 * confirm buttons so the user can VERIFY what the change does, not just its name.
 * The reason step chooses which to emit per intent (comparison / list / single),
 * or none. DISPLAY-ONLY and decoupled from `writes`: the shown values must match
 * the writes, but a malformed preview can never cause a bad write.
 */
export type FollowupSection =
  | { kind: 'comparison'; title: string; rows: Array<{ field: string; before: string; after: string }> }
  | { kind: 'list'; title: string; columns: string[]; rows: string[][] }
  | { kind: 'single'; title: string; tone?: 'default' | 'danger'; rows: Array<{ field: string; value: string }> };

export interface ChangeProposal {
  /** One-line summary of the whole change, in the user's selected language. */
  summary: string;
  /** The concrete writes to apply, in order, once the user confirms. */
  writes: ProposedWrite[];
  /** Optional generative preview (comparison / list / single) — display-only. */
  followup?: FollowupSection[];
}

/**
 * Coerce raw followup data into safe, known-kind sections: drops unknown kinds
 * and stringifies every value. Display-only — never throws, just cleans. This is
 * the whitelist that keeps LLM-authored preview data from injecting anything but
 * plain text into vetted components.
 */
export function sanitizeFollowup(raw: unknown): FollowupSection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const str = (v: unknown): string => (v == null ? '' : typeof v === 'string' ? v : String(v));
  const objRows = (rows: unknown): Record<string, unknown>[] =>
    Array.isArray(rows) ? rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : [];
  const out: FollowupSection[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const sec = s as Record<string, unknown>;
    const title = str(sec.title);
    if (sec.kind === 'comparison') {
      out.push({ kind: 'comparison', title, rows: objRows(sec.rows).map((r) => ({ field: str(r.field), before: str(r.before), after: str(r.after) })) });
    } else if (sec.kind === 'single') {
      out.push({ kind: 'single', title, tone: sec.tone === 'danger' ? 'danger' : 'default', rows: objRows(sec.rows).map((r) => ({ field: str(r.field), value: str(r.value) })) });
    } else if (sec.kind === 'list') {
      out.push({ kind: 'list', title, columns: Array.isArray(sec.columns) ? sec.columns.map(str) : [], rows: Array.isArray(sec.rows) ? sec.rows.map((row) => Array.isArray(row) ? row.map(str) : [str(row)]) : [] });
    }
    // unknown kind → skipped (forward-compatible + safe)
  }
  return out.length ? out : undefined;
}

/** Write functions a confirmed proposal is allowed to invoke. Defense in depth. */
export const ALLOWED_PROPOSAL_WRITES = new Set<string>([
  'updateActivity',
  'deleteActivity',
  'updateOpportunity',
  'updateAccount',
  'updateContact',
]);

export interface ApplyProposalResult {
  ok: boolean;
  /** How many writes completed successfully. */
  done: number;
  total: number;
  /** Index of the write that failed (if any). */
  failedAt?: number;
  error?: string;
}

/**
 * Validate a proposal before showing it to the user. Returns an error string
 * when the proposal is unsafe/malformed, or null when it's OK to render.
 */
export function validateProposal(proposal: ChangeProposal): string | null {
  if (!proposal || !Array.isArray(proposal.writes) || proposal.writes.length === 0) {
    return 'empty proposal';
  }
  for (const w of proposal.writes) {
    if (!w || typeof w.fn !== 'string' || !ALLOWED_PROPOSAL_WRITES.has(w.fn)) {
      return `disallowed write function: ${w?.fn}`;
    }
    // Every write must target a concrete record id — never a name/fuzzy ref.
    const hasId = Object.keys(w.args ?? {}).some((k) => /Id$/.test(k) && typeof w.args[k] === 'string' && (w.args[k] as string).trim() !== '');
    if (!hasId) return `write ${w.fn} has no concrete record id`;
  }
  return null;
}

/**
 * Apply a confirmed proposal's writes in order via the injected executor.
 * Stops at the first failure (partial application is reported).
 */
export async function applyProposal(
  proposal: ChangeProposal,
  exec: (fn: string, args: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>,
): Promise<ApplyProposalResult> {
  const total = proposal.writes.length;
  for (let i = 0; i < total; i++) {
    const w = proposal.writes[i];
    if (!ALLOWED_PROPOSAL_WRITES.has(w.fn)) {
      return { ok: false, done: i, total, failedAt: i, error: `disallowed write function: ${w.fn}` };
    }
    const res = await exec(w.fn, w.args);
    if (!res.success) {
      return { ok: false, done: i, total, failedAt: i, error: res.error || `write ${w.fn} failed` };
    }
  }
  return { ok: true, done: total, total };
}
