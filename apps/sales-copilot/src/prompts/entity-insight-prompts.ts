/**
 * Per-entity analysis prompts behind the AI insight card on the account,
 * opportunity, contact and activity detail pages.
 *
 * Account and activity are CONTEXT ONLY — the `skill.generateEntityInsight`
 * prompt owns their output structure. Opportunity and contact still ask for
 * Markdown sections directly, because they render through the legacy summary
 * path rather than the structured one.
 */
import type { PromptDefinition } from '@agentic/power-runtime';

export const entityInsightPrompts = [
  {
    key: 'entityInsight.actionItemsFormat',
    description:
      'Shared formatting directive so action items render as ONE correctly-numbered Markdown list.',
    contractVersion: 1,
    responseFormat: 'text',
    body: `Format the action items as ONE numbered Markdown list. Write each item on a single line as \`N. **Action title** — one or two sentences of specific guidance\`, numbered sequentially (1, 2, 3, 4). Do not put blank lines between items and do not split an item into a separate paragraph.`,
  },
  {
    key: 'entityInsight.account',
    contractVersion: 1,
    responseFormat: 'text',
    body: `Analyze this account in its full business context.

ACCOUNT: {{entityName}}
- Industry: {{industry}}
- Revenue: {{revenue}}

PUBLIC INTELLIGENCE (objective facts collected in Marketing Insight):
{{marketingInsight}}

PIPELINE — open opportunities:
{{opportunityList}}

RECENT ACTIVITIES:
{{activityList}}

CONTACTS: {{contactCount}}

Interpret the public intelligence in light of this account's own pipeline and activities — turn the facts into specific selling guidance, never a restatement.`,
  },
  {
    key: 'entityInsight.opportunity',
    contractVersion: 1,
    responseFormat: 'text',
    body: `Analyze this sales opportunity and provide actionable insights.

OPPORTUNITY: {{entityName}}
- Amount: {{amount}}
- Stage: {{stage}}
- Confidence Trend: {{confidenceTrend}}
- Close Date: {{closeDate}}

IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Just write the content directly.

Structure your response as:

### Summary
A brief summary (2-3 sentences) of the deal status and likelihood to close.

### Action Items
3-4 specific action items to advance this opportunity.

{{actionItemsFormat}}

Focus on deal acceleration and risk mitigation.`,
  },
  {
    key: 'entityInsight.contact',
    contractVersion: 1,
    responseFormat: 'text',
    body: `Analyze this sales contact and provide relationship insights.

CONTACT: {{entityName}}
- Title: {{title}}
- Email: {{email}}

IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Just write the content directly.

Structure your response as:

### Summary
A brief summary (2-3 sentences) of this contact's role and importance.

### Action Items
3-4 specific action items for engaging with this stakeholder.

{{actionItemsFormat}}

Focus on relationship building and influence mapping.`,
  },
  {
    key: 'entityInsight.activity',
    contractVersion: 1,
    responseFormat: 'text',
    body: `Analyze this sales activity in its business context.

ACTIVITY: {{entityName}}
- Type: {{type}}
- Status: {{status}}
- Scheduled: {{scheduled}}
- Notes / outcome: {{notes}}

ACCOUNT: {{accountLine}}
{{opportunityLine}}`,
  },
  {
    key: 'entityInsight.generic',
    description: 'Fallback for an entity type with no dedicated prompt.',
    contractVersion: 1,
    responseFormat: 'text',
    body: `Analyze this {{entityType}} and provide actionable sales insights with specific next steps. IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Include a ### Summary section and a ### Action Items section formatted as one sequentially numbered Markdown list (one item per line).`,
  },
] as const satisfies readonly PromptDefinition[];
