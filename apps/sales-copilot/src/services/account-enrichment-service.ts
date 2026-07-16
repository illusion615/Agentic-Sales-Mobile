/**
 * Account Enrichment — on-demand + copilot-driven customer intelligence.
 *
 * Reuses the existing Microsoft Copilot Studio connector
 * (`ExecuteCopilotAsyncV2`) to call the app-facing classic agent (product
 * knowledge + customer intelligence enrichment). The agent RESEARCHES public
 * sources and returns a structured JSON result; it does NOT write to Dataverse.
 * The frontend decides what to store: it maps the returned fields to the account
 * master fields and stores the agent-authored Marketing Insight Markdown.
 */

import { MicrosoftCopilotStudioService } from '@/generated/services/MicrosoftCopilotStudioService';
import { AccountService } from '@/generated/services/account-service';
import { AISummaryService } from '@/generated/services/ai-summary-service';
import { getContext } from '@microsoft/power-apps/app';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import { getCopilotConfig } from './copilot-service';
import { outputLanguageDirective, type Locale } from '@/lib/i18n';
import { industryLabel } from '@/lib/industry';
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
  /** Canonical Dataverse account.industrycode option value. */
  industrycode?: number;
  /** Legacy public label; retained for reply compatibility but not persisted. */
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

const EnrichmentFieldsSchema = z.object({
  websiteurl: z.string().optional(),
  telephone1: z.string().optional(),
  emailaddress1: z.string().optional(),
  address1_line1: z.string().optional(),
  address1_city: z.string().optional(),
  address1_stateorprovince: z.string().optional(),
  address1_country: z.string().optional(),
  address1_postalcode: z.string().optional(),
  industrycode: z.preprocess(
    (value) => {
      if (value === null || value === '') return undefined;
      return typeof value === 'string' && value.trim() ? Number(value) : value;
    },
    z.number().int().min(1).max(33).optional(),
  ),
  industry: z.string().optional(),
  description: z.string().optional(),
}).strip();

const EnrichmentResultSchema = z.object({
  status: z.enum(['ok', 'skipped']),
  reason: z.string().optional(),
  fields: EnrichmentFieldsSchema.optional(),
  marketingInsight: z.string().optional(),
}).strip().superRefine((result, ctx) => {
  if (result.status === 'skipped' && !result.reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'A skipped enrichment result must include a reason',
    });
  }
  const hasFieldValue = Object.entries(result.fields ?? {}).some(([key, value]) => {
    if (key === 'industry') return false; // Legacy label is intentionally not persisted.
    return typeof value === 'string' ? !!value.trim() : value !== undefined && value !== null;
  });
  if (result.status === 'ok' && !hasFieldValue && !result.marketingInsight?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A successful enrichment result must include fields or marketingInsight',
    });
  }
});

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

/**
 * Parse the first JSON object from an agent reply at the one response-contract
 * boundary. `jsonrepair` handles common model serialization defects (notably
 * unescaped quotation marks inside prose); Zod then prevents repaired but
 * contract-invalid content from reaching Dataverse.
 */
export function extractEnrichmentJson(reply: string): EnrichmentResult | null {
  if (!reply) return null;
  let s = reply.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  try {
    const candidate = JSON.parse(jsonrepair(s.slice(first, last + 1)));
    const parsed = EnrichmentResultSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Dataverse `account.description` hard limit. The customer profile must never
 * exceed this, or the write is rejected with validation error 0x80044331.
 */
const MAX_DESCRIPTION_LEN = 2000;

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
    industry: industryLabel(account.industry) || '',
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
  if (f.address1_line1) updates.addressLine1 = f.address1_line1;
  if (f.address1_city) updates.addressCity = f.address1_city;
  if (f.address1_stateorprovince) updates.addressStateOrProvince = f.address1_stateorprovince;
  if (f.address1_country) updates.addressCountry = f.address1_country;
  if (f.address1_postalcode) updates.addressPostalCode = f.address1_postalcode;
  if (f.industrycode !== undefined) updates.industry = String(f.industrycode);
  // Customer profile -> account.description (rendered in the account header card).
  if (f.description) updates.notes = f.description.trim().slice(0, MAX_DESCRIPTION_LEN);

  const updated = Object.keys(updates).length
    ? await AccountService.update(account.id, updates)
    : account;

  // Descriptive insight -> Marketing Insight record (AISummary, type='marketing'),
  // stored and rendered verbatim as the agent's ready-made Markdown.
  const insight = (result.marketingInsight || '').trim();
  if (insight) await saveMarketingInsight(account.id, insight);

  return updated;
}
