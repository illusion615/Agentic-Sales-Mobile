/**
 * Sales Copilot prompt catalog — the single place every instruction the app
 * sends to a model is authored.
 *
 * Call sites never hold prompt text. They ask for a KEY and pass the runtime
 * VARIABLES the body declares, which is what allows a body to later be served
 * from outside the build (a Dataverse row) without touching a single caller.
 *
 * Adding a prompt: add an entry to one of the catalog files, then reference its
 * key. Changing what a prompt OUTPUTS (its parsed shape) means bumping that
 * entry's contractVersion together with the parser that reads it.
 */
import {
  createPromptRegistry,
  type PromptOverride,
  type PromptOverrideReport,
  type PromptVariables,
} from '@agentic/power-runtime';
import { pipelinePrompts } from './pipeline-prompts';
import { skillPrompts } from './skill-prompts';
import { conversationPrompts } from './conversation-prompts';
import { entityInsightPrompts } from './entity-insight-prompts';
import { workflowPrompts } from './workflow-prompts';

const catalog = [
  ...pipelinePrompts,
  ...skillPrompts,
  ...conversationPrompts,
  ...entityInsightPrompts,
  ...workflowPrompts,
] as const;

export type SalesPromptKey = (typeof catalog)[number]['key'];

/**
 * Scope for every prompt of this app. Keys are unique per app, not globally —
 * field-service may define its own `frame.classify` without collision.
 */
export const SALES_APP_ID = 'sales-copilot';

export const salesPrompts = createPromptRegistry<SalesPromptKey>(catalog, {
  appId: SALES_APP_ID,
});

/** Renders a catalogued prompt. Throws if a declared variable is not supplied. */
export function renderPrompt(key: SalesPromptKey, variables?: PromptVariables): string {
  return salesPrompts.render(key, variables);
}

/**
 * Replaces builtin bodies with externally authored ones. The Dataverse prompt
 * store calls this during boot and on refresh; rejected rows leave the builtin
 * body in place.
 */
export function applyPromptOverrides(rows: PromptOverride[]): PromptOverrideReport {
  return salesPrompts.applyOverrides(rows);
}

export { pipelinePrompts, skillPrompts, conversationPrompts, entityInsightPrompts, workflowPrompts };
