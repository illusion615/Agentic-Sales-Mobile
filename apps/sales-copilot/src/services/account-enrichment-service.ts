/**
 * Account Enrichment — on-demand + copilot-driven customer intelligence.
 *
 * Reuses the existing Microsoft Copilot Studio connector
 * (`ExecuteCopilotAsyncV2`) to call the app-facing classic agent (product
 * knowledge + customer intelligence enrichment). The agent RESEARCHES public
 * sources and returns a structured JSON result; it does NOT write to Dataverse.
 * The frontend decides what to store: it maps the returned fields to the account
 * master fields and maintains the [AI-ENRICHMENT] block in the description.
 */

import { MicrosoftCopilotStudioService } from '@/generated/services/MicrosoftCopilotStudioService';
import { AccountService } from '@/generated/services/account-service';
import { AISummaryService } from '@/generated/services/ai-summary-service';
import { getContext } from '@microsoft/power-apps/app';
import { getCopilotConfig } from './copilot-service';
import { outputLanguageDirective, type Locale } from '@/lib/i18n';
import type { Account } from '@/generated/models/account-model';

/** Markers that delimit the AI-managed intelligence block inside the description. */
export const ENRICH_START = '[AI-ENRICHMENT:START]';
export const ENRICH_END = '[AI-ENRICHMENT:END]';

export interface EnrichmentFields {
  websiteurl?: string;
  telephone1?: string;
  emailaddress1?: string;
  address1_line1?: string;
  address1_city?: string;
  address1_stateorprovince?: string;
  address1_country?: string;
  address1_postalcode?: string;
  industry?: string;
  /** Concise customer profile → written to account.description (shown in the header). */
  description?: string;
}

/** Structured result returned by the enrichment agent (see agent instructions).
 *  Two parts: `fields` (account master-data updates, incl. description=profile)
 *  and `marketingInsight` (a ready-to-render Markdown string, stored + displayed
 *  verbatim). The app does NOT reconstruct or parse the insight content. */
export interface EnrichmentResult {
  status: 'ok' | 'skipped';
  reason?: string;
  fields?: EnrichmentFields;
  marketingInsight?: string;
}

export interface EnrichmentTriggerResult {
  success: boolean;
  /** Parsed structured result (when the agent returned valid JSON). */
  result?: EnrichmentResult;
  /** Raw agent reply, kept for diagnostics when parsing fails. */
  raw?: string;
  error?: string;
}

/** Split an account description into human-entered notes and the AI block. */
export function splitEnrichment(notes?: string): { human: string; enrichment: string } {
  if (!notes) return { human: '', enrichment: '' };
  const start = notes.indexOf(ENRICH_START);
  const end = notes.indexOf(ENRICH_END);
  if (start === -1 || end === -1 || end < start) return { human: notes.trim(), enrichment: '' };
  const enrichment = notes.slice(start + ENRICH_START.length, end).trim();
  const human = (notes.slice(0, start) + notes.slice(end + ENRICH_END.length)).trim();
  return { human, enrichment };
}

/** Extract the first top-level JSON object from a reply (tolerant of code fences / stray prose). */
function extractEnrichmentJson(reply: string): EnrichmentResult | null {
  if (!reply) return null;
  let s = reply.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  try {
    const obj = JSON.parse(s.slice(first, last + 1)) as EnrichmentResult;
    if (obj && (obj.status || obj.fields || obj.marketingInsight)) {
      if (obj.status !== 'skipped') obj.status = 'ok';
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}

/** Compose the granular address fields into a single human-readable line. */
function composeAddress(f: EnrichmentFields): string | undefined {
  const parts = [f.address1_line1, f.address1_city, f.address1_stateorprovince, f.address1_postalcode, f.address1_country]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Dataverse `account.description` hard limit. The merged notes (human text plus
 * the managed enrichment block) must never exceed this, or the write is rejected
 * with validation error 0x80044331.
 */
const MAX_DESCRIPTION_LEN = 2000;

/** Replace the description with the managed enrichment block. Enrichment fully
 *  OWNS `account.description`: any pre-existing text (including a legacy block
 *  from an earlier enrichment version) is intentionally not preserved. The block
 *  is capped to the Dataverse `description` limit. */
export function mergeEnrichmentIntoNotes(notes: string | undefined, block: string): string {
  void notes; // description is fully managed by enrichment; prior text is dropped.
  const budget = MAX_DESCRIPTION_LEN - ENRICH_START.length - ENRICH_END.length - 2;
  const b = block.length > budget ? `${block.slice(0, budget - 1).trimEnd()}\u2026` : block;
  return `${ENRICH_START}\n${b}\n${ENRICH_END}`;
}

/**
 * Ask the agent to research a single account and return structured intelligence.
 * Does NOT write to Dataverse — the caller decides what to store (see
 * `applyEnrichmentToAccount`).
 */
export async function triggerAccountEnrichment(
  account: Account,
  locale: Locale,
): Promise<EnrichmentTriggerResult> {
  const cfg = getCopilotConfig();
  // One agent for the whole app: the same knowledge/support agent that answers
  // product questions also returns enrichment intelligence. Sourced only from the
  // `copilot_studio_agent_name` Setting — no separate setting, no hardcoded name.
  const agentName = cfg.agentName;
  if (!agentName) {
    return {
      success: false,
      error:
        locale === 'zh-Hans'
          ? '尚未配置 Agent。请联系管理员在 Setting 表中设置 copilot_studio_agent_name。'
          : 'No agent is configured. Ask your administrator to set copilot_studio_agent_name in the Setting table.',
    };
  }

  // Constrain the connector to the environment this app is running in.
  let environmentId: string | undefined;
  try {
    environmentId = (await getContext())?.app?.environmentId;
  } catch (e) {
    console.warn('[Enrich] Could not resolve runtime environmentId:', e);
  }

  const payload = {
    accountName: account.name1,
    website: account.website || '',
    industry: account.industry || '',
    outputLanguage: locale,
  };

  const message = [
    'Account enrichment request. Research this customer account and return ONLY the enrichment JSON object exactly as described in your instructions (no prose, no code block).',
    '',
    'Payload:',
    JSON.stringify(payload),
    '',
    outputLanguageDirective(locale),
  ].join('\n');

  try {
    const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
      agentName,
      { message, notificationUrl: 'https://notificationurlplaceholder' },
      undefined,
      environmentId,
    );

    if (!result.success) {
      return { success: false, error: result.error?.message ?? 'Copilot Studio call failed' };
    }

    const data = result.data as unknown as { lastResponse?: string; responses?: string[] } | undefined;
    const raw = data?.lastResponse || data?.responses?.join('\n') || '';
    const parsed = extractEnrichmentJson(raw);
    if (!parsed) {
      return {
        success: false,
        raw,
        error: locale === 'zh-Hans' ? '未能解析情报结果，请稍后重试。' : 'Could not parse the enrichment result. Please try again.',
      };
    }
    return { success: true, result: parsed, raw };
  } catch (sdkError: unknown) {
    console.error('[Enrich] Copilot Studio SDK error:', sdkError);
    return { success: false, error: sdkError instanceof Error ? sdkError.message : 'Enrichment request failed' };
  }
}

/** AISummary discriminator value for the Marketing Insight record. */
export const MARKETING_INSIGHT_TYPE = 'marketing';

/** Upsert the account's Marketing Insight (objective facts) into the shared
 *  AISummary store as a type='marketing' record — the same mechanism Sales
 *  Insight uses. Kept out of the native description (which holds the profile). */
export async function saveMarketingInsight(accountId: string, block: string): Promise<void> {
  const now = new Date().toISOString();
  const expiresOn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const existing = (await AISummaryService.getAll()).find(
    (s) => s.entityID === accountId && s.entityType === 'account' && (s.type || '') === MARKETING_INSIGHT_TYPE,
  );
  if (existing) {
    await AISummaryService.update(existing.id, { summary: block, status: 'completed', generatedOn: now, expiresOn });
  } else {
    await AISummaryService.create({
      entityID: accountId, entityType: 'account', type: MARKETING_INSIGHT_TYPE,
      summary: block, status: 'completed', generatedOn: now, expiresOn,
    });
  }
}

/**
 * Persist an enrichment result to the account: update the public master fields,
 * write the customer PROFILE into the account description (shown in the header),
 * and store the objective facts block as the Marketing Insight record. Returns
 * the updated account, or null when the result was "skipped".
 */
export async function applyEnrichmentToAccount(
  account: Account,
  result: EnrichmentResult,
): Promise<Account | null> {
  if (result.status === 'skipped') return null;

  const f = result.fields || {};
  const updates: Partial<Omit<Account, 'id'>> = {};
  if (f.websiteurl) updates.website = f.websiteurl;
  if (f.telephone1) updates.phone = f.telephone1;
  if (f.emailaddress1) updates.email = f.emailaddress1;
  const addr = composeAddress(f);
  if (addr) updates.address = addr;
  // Customer profile -> account.description (rendered in the account header card).
  if (f.description) updates.notes = f.description.trim().slice(0, MAX_DESCRIPTION_LEN);

  const updated = await AccountService.update(account.id, updates);

  // Descriptive insight -> Marketing Insight record (AISummary, type='marketing'),
  // stored and rendered verbatim as the agent's ready-made Markdown.
  const insight = (result.marketingInsight || '').trim();
  if (insight) await saveMarketingInsight(account.id, insight);

  return updated;
}
