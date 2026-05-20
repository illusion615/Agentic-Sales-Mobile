/**
 * Sub-Prompt Registry
 *
 * Maps Frame Shadow (object × task) keys to focused sub-prompt builders.
 * Each sub-prompt is a short, domain-specific prompt that extracts
 * function name + arguments for exactly one category cell.
 */

import type { FrameResult } from '../frame-shadow';
import { getSubPromptKey } from '../frame-shadow';
import { accountPrompts } from './account-prompts';
import { contactPrompts } from './contact-prompts';
import { opportunityPrompts } from './opportunity-prompts';
import { activityPrompts } from './activity-prompts';
import { productPrompts } from './product-prompts';
import { mixedPrompts } from './mixed-prompts';
import { nonePrompts } from './none-prompts';

export interface SubPromptContext {
  userMessage: string;
  locale: 'zh-Hans' | 'en';
  frame: FrameResult;
  pageContext?: {
    currentPage: string;
    summary?: string;
    pageData?: unknown;
  };
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface SubPromptDef {
  /** Build the system prompt for this cell. */
  buildSystemPrompt: (ctx: SubPromptContext) => string;
  /** Build the user prompt (message + bound context). */
  buildUserPrompt: (ctx: SubPromptContext) => string;
}

/**
 * Registry: (object_task) → sub-prompt definition.
 * Keys match getSubPromptKey() output, e.g. "Activity_Log", "Product_Knowledge".
 */
const registry: Record<string, SubPromptDef> = {
  // Account
  ...accountPrompts,
  // Contact
  ...contactPrompts,
  // Opportunity
  ...opportunityPrompts,
  // Activity
  ...activityPrompts,
  // Product
  ...productPrompts,
  // Mixed
  ...mixedPrompts,
  // None
  ...nonePrompts,
};

/**
 * Look up the sub-prompt for a Frame classification result.
 * Returns null if no sub-prompt is registered for this cell.
 */
export function getSubPrompt(frame: FrameResult): SubPromptDef | null {
  const key = getSubPromptKey(frame);
  return registry[key] ?? null;
}

/** All registered keys (for testing/diagnostics). */
export function getRegisteredKeys(): string[] {
  return Object.keys(registry);
}
