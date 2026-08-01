/**
 * What we ask for at review, and what we accept back.
 *
 * The model is given the answered form, not the raw notes: this summarises what
 * the visit concluded, and the answers are what a person has stood behind.
 * Unanswered fields are left out entirely so the model cannot mistake a blank
 * for a negative finding.
 */
import { allFields, answerText, isAnswered, plainLabel, valueOf } from './form-schema';
import type { VisitSummary, VisitSummaryInput } from './visit-summary';
import { cleanList, cleanText, extractJsonObject } from './model-response';

const MAX_HIGHLIGHTS = 4;

export function buildVisitSummaryPrompt(input: VisitSummaryInput): string {
  const answered = allFields(input.schema)
    .map((field) => ({ field, entry: valueOf(input.values, field.name) }))
    .filter(({ entry }) => isAnswered(entry?.value))
    .map(({ field, entry }) => `- ${plainLabel(field)}：${answerText(field, entry!.value)}`);

  return [
    'You summarise a completed service visit for the service manager. Write in Chinese.',
    '',
    '## Job',
    `customer: ${input.workOrder.customerName}`,
    `incident: ${input.workOrder.incidentType ?? 'unspecified'}`,
    input.workOrder.assetName ? `equipment: ${input.workOrder.assetName}` : '',
    '',
    '## What the engineer recorded',
    answered.join('\n') || '(nothing recorded yet)',
    '',
    '## Rules',
    '1. Use ONLY the recorded answers. Never add a cause, a part or an outcome that is not there.',
    '2. text: one short paragraph a manager could read on its own — what was wrong, what was done, where it stands.',
    '3. Say plainly when the equipment is not fully restored or follow-up is outstanding.',
    '4. highlights: at most 4 short phrases worth pulling out. Omit rather than pad.',
    '5. When almost nothing is recorded, say so instead of inventing a conclusion.',
    '',
    '## Output',
    'Return ONLY this JSON, no prose and no code fence:',
    '{"text":"...","highlights":["..."]}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export interface ParsedVisitSummary {
  summary: VisitSummary | null;
  problem?: string;
}

export function parseVisitSummaryResponse(raw: string): ParsedVisitSummary {
  const json = extractJsonObject(raw);
  if (!json) return { summary: null, problem: '模型没有返回 JSON' };

  let parsed: { text?: unknown; highlights?: unknown };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return { summary: null, problem: '模型返回的 JSON 无法解析' };
  }

  const text = cleanText(parsed.text);
  if (!text) return { summary: null, problem: '模型没有给出摘要' };

  return { summary: { text, highlights: cleanList(parsed.highlights, MAX_HIGHLIGHTS) } };
}
