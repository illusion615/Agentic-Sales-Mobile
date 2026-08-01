/**
 * What we ask for before the visit, and what we accept back.
 *
 * The briefing is grounded: the model is given the job, the customer profile
 * and the service history, and told to work only from those. Anything it
 * returns that is not a usable line is dropped rather than shown, because a
 * technician skim-reading on the way in has no way to tell a padded sentence
 * from a real one.
 */
import type { BriefingContext, Briefing } from './briefing';
import { recentFirst } from './briefing';
import { cleanList, cleanText, extractJsonObject } from './model-response';

const MAX_WATCH_OUTS = 6;
const MAX_PREPARATION = 5;

export function buildBriefingPrompt(context: BriefingContext): string {
  const { workOrder, customer, history } = context;

  return [
    'You brief a field service engineer on the way to a job. Write in Chinese.',
    '',
    '## Job',
    `customer: ${customer.name}`,
    `incident: ${workOrder.incidentType ?? 'unspecified'}`,
    workOrder.assetName ? `equipment: ${workOrder.assetName}` : '',
    workOrder.summary ? `reported: ${workOrder.summary}` : '',
    workOrder.instructions ? `dispatch note: ${workOrder.instructions}` : '',
    '',
    '## Customer profile',
    customer.siteAccessNotes ? `site access: ${customer.siteAccessNotes}` : '',
    customer.cautions?.length ? `standing cautions: ${customer.cautions.join(' | ')}` : '',
    customer.contacts?.length
      ? `contacts: ${customer.contacts.map((c) => `${c.name}${c.role ? `(${c.role})` : ''} ${c.phone ?? ''}`.trim()).join(' | ')}`
      : '',
    '',
    '## Service history (most recent first)',
    recentFirst(history)
      .map((e) => `- ${e.completedOn.slice(0, 10)} ${e.incidentType}: ${e.resolution}`)
      .join('\n') || '(none)',
    '',
    '## Rules',
    '1. Use ONLY the facts above. Never invent a part, a person or a date.',
    '2. background: 2-3 sentences on what this job is and what happened here before.',
    '3. A repeat of the same fault is the most important thing to say. Say it plainly.',
    '4. watchOuts: site rules, access constraints and standing cautions that affect getting the work done.',
    '5. preparation: concrete things to bring, check or do before arriving.',
    '6. Omit a list entirely rather than padding it. Empty is a valid answer.',
    '',
    '## Output',
    'Return ONLY this JSON, no prose and no code fence:',
    '{"background":"...","watchOuts":["..."],"preparation":["..."]}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export interface ParsedBriefing {
  briefing: Briefing | null;
  /** Why nothing usable came back, for the caller to surface. */
  problem?: string;
}

export function parseBriefingResponse(raw: string): ParsedBriefing {
  const json = extractJsonObject(raw);
  if (!json) return { briefing: null, problem: '模型没有返回 JSON' };

  let parsed: { background?: unknown; watchOuts?: unknown; preparation?: unknown };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return { briefing: null, problem: '模型返回的 JSON 无法解析' };
  }

  const background = cleanText(parsed.background);
  // Without background there is no briefing; the two lists are genuinely optional.
  if (!background) return { briefing: null, problem: '模型没有给出背景说明' };

  return {
    briefing: {
      background,
      watchOuts: cleanList(parsed.watchOuts, MAX_WATCH_OUTS),
      preparation: cleanList(parsed.preparation, MAX_PREPARATION),
    },
  };
}
