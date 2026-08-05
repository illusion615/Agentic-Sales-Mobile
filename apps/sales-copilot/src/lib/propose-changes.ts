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
import { renderPrompt } from '@/prompts';
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

function buildProposePrompt(language: string): { text: string; variables: Record<string, string> } {
  const variables = {
    language,
    allowedWrites: Array.from(ALLOWED_PROPOSAL_WRITES).join(', '),
  };
  return { text: renderPrompt('propose.changes', variables), variables };
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
  const { text: system, variables: proposeVariables } = buildProposePrompt(ctx.language);
  const user = renderPrompt('propose.changesRequest', {
    goal: ctx.goal,
    records: ctx.recordsText,
  });
  const resp = await invokeFlowForLLM({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    responseFormat: 'text',
  }, {
    label: 'Propose changes',
    prompt: { key: 'propose.changes' },
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
