/**
 * proposeChanges — the "想一下 / think" reason step.
 *
 * Given a GOAL (what the user asked, e.g. "merge these two duplicate visits")
 * plus the RECORDS in scope (dumped as text from a prior query step — the same
 * text channel summarizeDAGResults uses), the LLM decides the concrete writes
 * and returns a ChangeProposal. The runtime then renders it as a confirm card;
 * nothing is written until the user confirms.
 *
 * This step is intentionally GENERIC: merge / deduplicate / reconcile /
 * "compare then change" all use it — only the goal + records differ.
 */

import { invokeFlowForLLM } from '@/services/power-automate-service';
import { type ChangeProposal, validateProposal, ALLOWED_PROPOSAL_WRITES, sanitizeFollowup } from './change-proposal';

export interface ProposeContext {
  /** What the user wants done, in their own words. */
  goal: string;
  /** The records in scope, one per line, each including its concrete id. */
  recordsText: string;
  /** English name of the user's selected output language (e.g. "Simplified Chinese", "German"). */
  language: string;
}

export interface ProposeOutcome {
  proposal: ChangeProposal | null;
  raw?: string;
  error?: string;
}

function buildProposePrompt(language: string): string {
  const allowed = Array.from(ALLOWED_PROPOSAL_WRITES).join(', ');
  return `You help a salesperson tidy CRM records. Given a goal and the records in scope, decide the concrete changes to apply. The user will confirm before anything is written.

# Output language
Write ALL user-facing text — "summary", every write "label", and every followup "title", "field" and descriptive "value" — in ${language}. Use natural, human-friendly wording. For a field name, use a friendly ${language} label describing the field (its meaning), NOT the raw data key. Format dates/times readably (e.g. 2026-07-03 08:19), never raw ISO. Leave record ids and codes untranslated.

# Output (JSON only, no markdown, no prose)
{
  "summary": "one-line summary of the change",
  "writes": [
    { "fn": "<one of: ${allowed}>", "args": { "<idField>": "<concrete id from the records>", "...": "..." }, "label": "short label for this change" }
  ],
  "followup": [
    { "kind": "comparison", "title": "<what changes>", "rows": [ { "field": "<friendly field label>", "before": "<current value>", "after": "<new value>" } ] },
    { "kind": "single", "title": "<e.g. record being deleted>", "tone": "danger", "rows": [ { "field": "<friendly field label>", "value": "<value>" } ] }
  ]
}

# Hard rules (writes = what actually gets executed)
- "fn" MUST be one of: ${allowed}. Never a query, draft, or any other function.
- Every write MUST target a CONCRETE record id taken from the records below (e.g. "activityId": "<id>"). NEVER use a name or a placeholder — if you cannot find an id, omit that write.
- Use ONLY information present in the records. Do NOT invent fields, dates, amounts, or details.
- Keep "summary" and every "label" short and specific.

# How to MERGE duplicates
- Choose the record to KEEP (prefer the more complete / more recently updated one).
- Emit ONE updateActivity for the kept record ("activityId": "<keepId>") whose args fill in any better or missing information carried by the other record (e.g. a fuller description/notes). Only include fields that actually change.
- Emit ONE deleteActivity for the other record ("activityId": "<deleteId>").
- If the records are NOT actually duplicates, return an empty "writes" array and say so in the summary.

# followup — a preview so the user can VERIFY the data (optional)
Emit "followup" data sections (in ${language}, plain strings) so the user sees WHAT changes, not just the action names:
- "comparison": before → after for the fields that change. FIDELITY: every "after" MUST equal the value you put in the matching write's args (what the user sees = what gets written); every "before" MUST be the CURRENT value from the records below — never invent either side. Include ONLY fields that actually change.
- "single": one record's key fields — use tone "danger" for a record being deleted.
- "list": multiple rows ("columns" + "rows") — for bulk / many-record previews.
- For a MERGE: emit ONE "comparison" (kept record: before = its current fields, after = your merged updateActivity args) + ONE "single" tone "danger" (the record being deleted).
- If there is genuinely nothing structured worth showing (e.g. a simple status flip), OMIT "followup" entirely.

Output the JSON object only.`;
}

/** Extract + shape-check a ChangeProposal from raw LLM text. Returns null if unusable. */
export function parseProposal(text: string): ChangeProposal | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      candidate = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  const writesRaw = obj.writes;
  if (!Array.isArray(writesRaw)) return null;
  const writes = writesRaw
    .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
    .map((w) => ({
      fn: typeof w.fn === 'string' ? w.fn : '',
      args: (w.args && typeof w.args === 'object') ? (w.args as Record<string, unknown>) : {},
      label: typeof w.label === 'string' ? w.label : '',
    }));
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    writes,
    followup: sanitizeFollowup(obj.followup),
  };
}

/** Call the LLM to produce a validated ChangeProposal (or null + reason). */
export async function generateProposal(ctx: ProposeContext): Promise<ProposeOutcome> {
  const system = buildProposePrompt(ctx.language);
  const user = `[Goal]\n${ctx.goal}\n\n[Records in scope]\n${ctx.recordsText}`;
  const resp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    responseFormat: 'text',
  });
  if (!resp.success || !resp.content) {
    return { proposal: null, error: resp.error ? String(resp.error) : 'LLM call failed' };
  }
  const parsed = parseProposal(resp.content);
  if (!parsed) return { proposal: null, raw: resp.content, error: 'parse failed' };
  // Empty writes = the model judged there's nothing to change (e.g. not duplicates).
  if (parsed.writes.length === 0) return { proposal: parsed, raw: resp.content };
  const invalid = validateProposal(parsed);
  if (invalid) return { proposal: null, raw: resp.content, error: invalid };
  return { proposal: parsed, raw: resp.content };
}
