/**
 * Attachment → activity assignment.
 *
 * Decides which composer attachments belong to which activity draft in a single
 * user turn, then stamps the chosen ids onto each activity intent's arguments
 * (reserved key `__attachmentIds`). buildQueueFromIntent spreads arguments into
 * each QueueIntent, so the ids ride through to the form-card unchanged.
 *
 * Phase-1 scope: activities only.
 *   - 0 activity drafts  → no-op (nothing to attach to)
 *   - 1 activity draft   → all attachments go to it (precise by construction)
 *   - N activity drafts  → a dedicated LLM call maps each attachment to a draft
 *                          by reading the user message + activity titles + file
 *                          names; any failure falls back to the primary draft.
 */
import type { IntentResult } from './copilot-agent-types';
import type { AttachmentMeta } from './attachments';

/** Reserved arguments key carrying assigned attachment ids through the queue. */
export const ATTACHMENT_IDS_KEY = '__attachmentIds';

interface ActivitySlot {
  args: Record<string, unknown>;
  /** Human-readable label for the LLM prompt (title / account). */
  label: string;
}

function slotLabel(args: Record<string, unknown>): string {
  const title = (args.title ?? args.name ?? '') as string;
  const account = (args.accountName ?? '') as string;
  return [title, account].filter(Boolean).join(' · ') || 'activity';
}

/** Collect the activity-draft slots from a raw intent, in queue order. */
function collectActivitySlots(rawIntent: IntentResult): ActivitySlot[] {
  const slots: ActivitySlot[] = [];
  if (rawIntent.function === 'draftActivity') {
    if (!rawIntent.arguments) rawIntent.arguments = {};
    slots.push({ args: rawIntent.arguments, label: slotLabel(rawIntent.arguments) });
  }
  for (const a of rawIntent.additionalActions ?? []) {
    if (a.function === 'draftActivity') {
      if (!a.arguments) a.arguments = {};
      slots.push({ args: a.arguments, label: slotLabel(a.arguments) });
    }
  }
  return slots;
}

/**
 * Ask the LLM to map attachments to activity drafts. Returns an array parallel
 * to `attachments`, each entry the 0-based activity index (or 0 on any doubt).
 */
async function llmAssign(
  slots: ActivitySlot[],
  attachments: AttachmentMeta[],
  userMessage: string,
  locale: string,
): Promise<number[]> {
  const isZh = locale === 'zh-Hans';
  const activityList = slots.map((s, i) => `${i}: ${s.label}`).join('\n');
  const fileList = attachments.map((a, i) => `${i}: ${a.name} (${a.type})`).join('\n');

  const system = isZh
    ? '你是一个销售助手。用户在一条消息里记录了多个活动并附带了若干文件。根据用户消息、活动标题和文件名，把每个文件分配给最相关的活动。只返回 JSON。'
    : 'You are a sales assistant. In one message the user logged several activities and attached files. Using the message, activity titles, and file names, assign each file to its most relevant activity. Return JSON only.';
  const user = [
    `User message:\n${userMessage}`,
    `Activities (index: label):\n${activityList}`,
    `Files (index: name):\n${fileList}`,
    'Return JSON: {"assignments":[{"file":<fileIndex>,"activity":<activityIndex>}, ...]} covering every file index exactly once.',
  ].join('\n\n');

  const fallback = attachments.map(() => 0);
  try {
    const { invokeFlowForLLM } = await import('@/services/power-automate-service');
    const resp = await invokeFlowForLLM({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      responseFormat: 'json-generic',
    });
    if (!resp.success || !resp.content) return fallback;

    let parsed: unknown;
    try {
      parsed = JSON.parse(resp.content);
    } catch {
      const m = resp.content.match(/\{[\s\S]*\}/);
      if (!m) return fallback;
      parsed = JSON.parse(m[0]);
    }
    const list = (parsed as { assignments?: Array<{ file?: number; activity?: number }> })?.assignments;
    if (!Array.isArray(list)) return fallback;

    const out = [...fallback];
    for (const entry of list) {
      const f = entry?.file;
      const a = entry?.activity;
      if (typeof f === 'number' && f >= 0 && f < attachments.length &&
          typeof a === 'number' && a >= 0 && a < slots.length) {
        out[f] = a;
      }
    }
    return out;
  } catch (e) {
    console.warn('[attachments] llm assign failed, defaulting to primary', e);
    return fallback;
  }
}

/**
 * Assign attachments to activity drafts and stamp `__attachmentIds` onto each
 * activity intent's arguments. Mutates rawIntent in place. Never throws.
 */
export async function assignAttachmentsToIntent(
  rawIntent: IntentResult,
  attachments: AttachmentMeta[],
  userMessage: string,
  locale: string,
): Promise<void> {
  if (!attachments.length) return;
  const slots = collectActivitySlots(rawIntent);
  if (slots.length === 0) return; // phase-1: only activities receive attachments

  if (slots.length === 1) {
    slots[0].args[ATTACHMENT_IDS_KEY] = attachments.map((a) => a.id);
    return;
  }

  const mapping = await llmAssign(slots, attachments, userMessage, locale);
  const buckets: string[][] = slots.map(() => []);
  attachments.forEach((att, i) => {
    const slotIdx = mapping[i] ?? 0;
    (buckets[slotIdx] ?? buckets[0]).push(att.id);
  });
  slots.forEach((slot, i) => {
    if (buckets[i].length) slot.args[ATTACHMENT_IDS_KEY] = buckets[i];
  });
}
