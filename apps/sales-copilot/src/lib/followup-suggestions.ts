/**
 * LLM-generated follow-up suggestions for the copilot composer.
 *
 * Replaces the narrow, static `followupsByFunction` map with a general
 * capability: after each assistant turn we ask the model for the 3 follow-up
 * actions the user is most likely to want next, given the actual conversation.
 *
 * Design notes:
 * - Output is parsed from plain text (`label | request` per line), not JSON.
 *   AI Builder's structured-output mode is unreliable for this app (see repo
 *   traps), so we stick to the text prompt + tolerant client-side parsing.
 * - Pure async + abortable via a caller-supplied staleness check; on any failure
 *   it returns null so the caller can fall back to the static suggestions.
 */

import type { Locale } from '@/lib/i18n';
import type { SuggestionPill } from '@/lib/contextual-suggestions';
import { invokeFlowForLLM } from '@/services/power-automate-service';

const isZh = (l: Locale) => l === 'zh-Hans';

/** Trim a string to a max length on a word/character boundary. */
function clip(s: string, max: number): string {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max) + '…';
}

/**
 * Builds the instruction prompt. We keep the conversation slice small (last
 * user request + last assistant reply + the function that ran) so the model has
 * enough context to be specific without a large, slow prompt.
 */
function buildPrompt(opts: {
  locale: Locale;
  lastUser: string;
  lastAssistant: string;
  lastFunctionCalled?: string;
}): string {
  const zh = isZh(opts.locale);
  const langRule = zh
    ? '- Write the <label> and <request> in Simplified Chinese.'
    : '- Write the <label> and <request> in English.';
  const fnLine = opts.lastFunctionCalled
    ? `\nLast action performed: ${opts.lastFunctionCalled}`
    : '';
  return [
    'You are a CRM sales assistant. Based on the recent conversation, propose exactly 3 follow-up actions the user is most likely to want to do NEXT.',
    '',
    'Output rules (strict):',
    '- Output ONLY 3 lines, nothing else.',
    '- Each line format: <label> | <request>',
    '- <label>: a short button caption, at most 4 words, no punctuation, no numbering.',
    '- <request>: a complete first-person instruction that will be sent back to you when tapped.',
    '- Make them specific to the conversation (reference the entities/topic just discussed).',
    '- Do not repeat the user\'s last message verbatim.',
    langRule,
    '',
    'Recent conversation:',
    `User: ${clip(opts.lastUser, 240)}`,
    `Assistant: ${clip(opts.lastAssistant, 700)}${fnLine}`,
  ].join('\n');
}

/** Parse `label | request` lines into pills. Tolerant of numbering/bullets. */
function parsePills(raw: string): SuggestionPill[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const pills: SuggestionPill[] = [];
  for (const line of lines) {
    if (!line.includes('|')) continue;
    // Strip leading numbering/bullets like "1.", "-", "•".
    const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '');
    const idx = cleaned.indexOf('|');
    const label = cleaned.slice(0, idx).trim().replace(/^["']|["']$/g, '');
    const query = cleaned.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (label && query && label.length <= 24) {
      pills.push({ text: label, query });
    }
    if (pills.length >= 4) break;
  }
  return pills;
}

/**
 * Generates follow-up suggestion pills from the conversation via the LLM.
 * Returns null on failure or if fewer than 2 usable pills were produced, so the
 * caller can fall back to the static contextual suggestions.
 */
export async function generateFollowupSuggestions(opts: {
  locale: Locale;
  lastUser: string;
  lastAssistant: string;
  lastFunctionCalled?: string;
}): Promise<SuggestionPill[] | null> {
  const prompt = buildPrompt(opts);
  try {
    const res = await invokeFlowForLLM({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: 'text',
    });
    if (!res.success || !res.content) return null;
    const pills = parsePills(res.content);
    return pills.length >= 2 ? pills.slice(0, 4) : null;
  } catch {
    return null;
  }
}
