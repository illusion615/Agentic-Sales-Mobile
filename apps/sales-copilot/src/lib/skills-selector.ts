/**
 * Skills Selector
 *
 * Filters the function registry by the sales objects mentioned across all
 * intents in a multi-intent Frame. The Orchestrator prompt is then built
 * from this short list, keeping token count down.
 *
 * No more "Mixed" branch — multi-intent is naturally `intents.length > 1`,
 * and we just take the union of salesObjects across intents.
 */

import { availableFunctions, type FunctionDefinition } from './function-registry';
import type { IntentItem, FrameSalesObject } from './frame-shadow';

/** Map each function to the sales object(s) it operates on. */
const SKILL_OBJECT_MAP: Record<string, FrameSalesObject[]> = {
  // Account
  searchAccounts: ['Account'],
  getAccountDetails: ['Account'],
  getAccountsByRegion: ['Account'],
  getAccountsByTier: ['Account'],
  getAccountsNeedingFollowUp: ['Account'],
  draftAccount: ['Account'],
  updateAccount: ['Account'],
  fuzzyMatchAccount: ['Account'],

  // Contact
  getContactsByAccount: ['Contact'],
  draftContact: ['Contact'],
  updateContact: ['Contact'],
  fuzzyMatchContact: ['Contact'],

  // Opportunity
  getMyOpportunities: ['Opportunity'],
  getTopOpportunities: ['Opportunity'],
  getOpportunitiesByAccount: ['Opportunity'],
  getOpportunitiesClosingSoon: ['Opportunity'],
  draftOpportunity: ['Opportunity'],
  updateOpportunity: ['Opportunity'],
  fuzzyMatchOpportunity: ['Opportunity'],

  // Activity
  getTodayActivities: ['Activity'],
  getUpcomingActivities: ['Activity'],
  getActivitiesByAccount: ['Activity'],
  draftActivity: ['Activity'],
  updateActivity: ['Activity'],
  fuzzyMatchActivity: ['Activity'],
  fillActivityForm: ['Activity'],

  // Product (→ Copilot Studio)
  queryCopilotStudio: ['Product'],

  // External knowledge
  externalKnowledgeQuery: ['None'],

  // Cross-entity / fallback skills (always included regardless of salesObject)
  // Note: these are NOT filtered by salesObject — see selectSkillsForIntents.
};

/** Skills that are always available regardless of salesObject targeting. */
const ALWAYS_AVAILABLE = new Set(['batchDraft', 'getSalesSummary', 'externalKnowledgeQuery']);

/**
 * Select skills relevant to the union of salesObjects across all intents.
 * Always includes cross-cutting fallback skills (batchDraft, getSalesSummary, externalKnowledgeQuery).
 */
export function selectSkillsForIntents(intents: IntentItem[]): FunctionDefinition[] {
  const targets = new Set<FrameSalesObject>();
  for (const intent of intents) {
    targets.add(intent.salesObject);
  }
  // Empty intents list is treated as None.
  if (targets.size === 0) targets.add('None');

  return availableFunctions.filter((fn) => {
    if (ALWAYS_AVAILABLE.has(fn.name)) return true;
    const objectsForFn = SKILL_OBJECT_MAP[fn.name];
    if (!objectsForFn) return true; // unmapped → available to all
    return objectsForFn.some((obj) => targets.has(obj));
  });
}

/**
 * Format selected skills as a compact string for the Orchestrator prompt.
 * Only includes name, description, and parameters — no verbose schema.
 */
export function formatSkillsForPrompt(
  skills: FunctionDefinition[],
  locale: 'zh-Hans' | 'en'
): string {
  return skills
    .map((fn) => {
      const params = Object.entries(fn.parameters.properties)
        .map(([key, param]) => {
          const req = fn.parameters.required?.includes(key) ? ' (required)' : '';
          return `  - ${key}: ${param.description}${req}`;
        })
        .join('\n');
      const displayName = locale === 'zh-Hans' ? fn.displayName['zh-Hans'] : fn.displayName['en-US'];
      return `[${fn.name}] ${displayName}\n${fn.description}\nParameters:\n${params}`;
    })
    .join('\n\n');
}
