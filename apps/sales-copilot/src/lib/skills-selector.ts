/**
 * Skills Selector
 *
 * Filters the function registry (skills) based on Frame Shadow classification.
 * The Agent Engine only receives skills relevant to the detected object types,
 * keeping the orchestration prompt focused and short.
 */

import { availableFunctions, type FunctionDefinition } from './function-registry';
import type { FrameResult, FrameSalesObject } from './frame-shadow';

/**
 * Map each function to the sales object(s) it operates on.
 * Functions not listed here are available to all categories.
 */
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

  // Mixed / cross-entity
  batchDraft: ['Mixed', 'Account', 'Contact', 'Opportunity', 'Activity'],
  getSalesSummary: ['Mixed', 'None'],
};

/**
 * Select skills relevant to a Frame classification.
 *
 * For single-object frames (e.g. Activity), returns only Activity skills + batchDraft.
 * For Mixed frames, returns skills for ALL objects mentioned in explicitNames,
 * plus batchDraft and cross-entity skills.
 * Always includes batchDraft for multi-intent capability.
 */
export function selectSkills(frame: FrameResult): FunctionDefinition[] {
  const targetObjects = new Set<FrameSalesObject>();

  if (frame.salesObject === 'Mixed') {
    // Mixed: include all object types found in explicitNames
    if (frame.explicitNames?.length) {
      for (const name of frame.explicitNames) {
        const obj = kindToObject(name.kind);
        if (obj) targetObjects.add(obj);
      }
    }
    // If no explicit names, include the most common objects
    if (targetObjects.size === 0) {
      targetObjects.add('Account');
      targetObjects.add('Contact');
      targetObjects.add('Opportunity');
      targetObjects.add('Activity');
    }
    targetObjects.add('Mixed');
  } else if (frame.salesObject === 'None') {
    targetObjects.add('None');
  } else {
    targetObjects.add(frame.salesObject);
    // Always include Mixed for potential multi-intent
    targetObjects.add('Mixed');
  }

  return availableFunctions.filter((fn) => {
    const objectsForFn = SKILL_OBJECT_MAP[fn.name];
    if (!objectsForFn) return true; // unmapped functions available to all
    return objectsForFn.some((obj) => targetObjects.has(obj));
  });
}

/**
 * Format selected skills as a compact string for the Agent Engine prompt.
 * Only includes name, description, and required parameters — no verbose schema.
 */
export function formatSkillsForPrompt(skills: FunctionDefinition[], locale: 'zh-Hans' | 'en'): string {
  return skills.map((fn) => {
    const params = Object.entries(fn.parameters.properties)
      .map(([key, param]) => {
        const req = fn.parameters.required?.includes(key) ? ' (required)' : '';
        return `  - ${key}: ${param.description}${req}`;
      })
      .join('\n');
    const displayName = locale === 'zh-Hans' ? fn.displayName['zh-Hans'] : fn.displayName['en-US'];
    return `[${fn.name}] ${displayName}\n${fn.description}\nParameters:\n${params}`;
  }).join('\n\n');
}

function kindToObject(kind: string): FrameSalesObject | null {
  switch (kind) {
    case 'account': return 'Account';
    case 'contact': return 'Contact';
    case 'opportunity': return 'Opportunity';
    case 'product': return 'Product';
    default: return null;
  }
}
