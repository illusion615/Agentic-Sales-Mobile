import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCreateAISummary, useUpdateAISummary, useAISummaryList } from '@/generated/hooks/use-aisummary';
import type { AISummary } from '@/generated/models/ai-summary-model';
import { getLocale, type Locale } from '@/lib/i18n';
import { industryLabel } from '@/lib/industry';
import { normalizeInsightActions } from '@/lib/insight-actions';
import { useAppSettings } from './use-app-settings';
import { useUser } from './use-user';

// Entity type labels (DV FormattedValue)
export const ENTITY_TYPES = {
  account: 'account',
  opportunity: 'opportunity',
  contact: 'contact',
  activity: 'activity',
} as const;

// Status labels (DV FormattedValue)
export const STATUSES = {
  pending: 'pending',
  generating: 'generating',
  completed: 'completed',
  failed: 'failed',
} as const;

export type EntityType = 'account' | 'opportunity' | 'contact' | 'activity';

/** localStorage marker of the language an entity's stored summary was generated in. */
const aiSummaryLocaleKey = (entityType: EntityType, entityId: string) => `ai-summary-locale:${entityType}:${entityId}`;

interface TriggerSummaryParams {
  entityType: EntityType;
  entityId: string;
  entityData: Record<string, unknown>;
  relatedData?: Record<string, unknown>;
  locale?: Locale;
}

/**
 * Extract entity name from data
 */
function getEntityName(entityType: EntityType, entityData: Record<string, unknown>): string {
  switch (entityType) {
    case 'account':
      return String(entityData.name1 || entityData.name || 'Unknown Account');
    case 'opportunity':
      return String(entityData.name1 || entityData.name || 'Unknown Opportunity');
    case 'contact':
      return String(entityData.fullname || entityData.name || 'Unknown Contact');
    case 'activity':
      return String(entityData.title || entityData.subject || 'Unknown Activity');
    default:
      return 'Unknown Entity';
  }
}

/**
 * Build an AI-friendly prompt based on entity context
 * Converts key values to human-readable labels
 */
/**
 * Shared formatting directive so every entity's Action Items render as a single,
 * correctly-numbered Markdown list (one self-contained item per line) instead of a
 * title-plus-separate-paragraph structure that Markdown splits into many 1-item lists.
 */
const ACTION_ITEMS_FORMAT =
  'Format the action items as ONE numbered Markdown list. Write each item on a single line as ' +
  '`N. **Action title** — one or two sentences of specific guidance`, numbered sequentially ' +
  '(1, 2, 3, 4). Do not put blank lines between items and do not split an item into a separate paragraph.';

function buildAIPrompt(
  entityType: EntityType,
  entityData: Record<string, unknown>,
  relatedData?: Record<string, unknown>
): string {
  const entityName = getEntityName(entityType, entityData);
  
  switch (entityType) {
    case 'account': {
      const opportunities = relatedData?.opportunities as Array<Record<string, unknown>> | undefined;
      const activities = relatedData?.activities as Array<Record<string, unknown>> | undefined;
      const contacts = relatedData?.contacts as Array<Record<string, unknown>> | undefined;
      const marketingInsight = (relatedData?.marketingInsight as string | undefined)?.trim();
      const oppList = opportunities?.length
        ? opportunities.map((o) => {
            const amt = o.amount ? `, $${Number(o.amount).toLocaleString()}` : '';
            return `- ${o.name || 'Opportunity'} — ${o.stage || 'stage n/a'}${amt}`;
          }).join('\n')
        : 'None';
      const actList = activities?.length
        ? activities.slice(0, 8).map((a) => {
            const meta = [a.type, a.date ? String(a.date).slice(0, 10) : ''].filter(Boolean).join(', ');
            return `- ${a.title || 'Activity'}${meta ? ` (${meta})` : ''}`;
          }).join('\n')
        : 'None';

      return `Produce actionable Sales Insight for this account.

ACCOUNT: ${entityName}
- Industry: ${industryLabel(entityData.industry as string | number | null | undefined) || 'Not specified'}
- Revenue: ${entityData.annualrevenue ? `$${Number(entityData.annualrevenue).toLocaleString()}` : 'Not specified'}

PUBLIC INTELLIGENCE (objective facts collected in Marketing Insight):
${marketingInsight || 'No marketing insight has been collected yet.'}

PIPELINE — open opportunities:
${oppList}

RECENT ACTIVITIES:
${actList}

CONTACTS: ${contacts?.length || 0}

Interpret the PUBLIC INTELLIGENCE above in light of this account's own pipeline and activities. Do not merely restate the facts; turn them into selling guidance.

IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Just write the content directly.

Structure your response as:

### Summary
A brief summary (2-3 sentences) of where the account stands and the near-term opportunity.

### Action Items
3-4 specific, prioritized action items (sales angles to pursue and concrete next steps), each tied to a fact, opportunity, or activity above.

${ACTION_ITEMS_FORMAT}`;
    }
    
    case 'opportunity': {
      const stageLabel = (entityData.stage as string) || 'Not specified';
      const trendLabel = (entityData.confidenceTrend as string) || 'Not specified';
      
      return `Analyze this sales opportunity and provide actionable insights.

OPPORTUNITY: ${entityName}
- Amount: ${entityData.totalamount ? `$${Number(entityData.totalamount).toLocaleString()}` : 'Not specified'}
- Stage: ${stageLabel}
- Confidence Trend: ${trendLabel}
- Close Date: ${entityData.expectedclosedate || 'Not specified'}

IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Just write the content directly.

Structure your response as:

### Summary
A brief summary (2-3 sentences) of the deal status and likelihood to close.

### Action Items
3-4 specific action items to advance this opportunity.

${ACTION_ITEMS_FORMAT}

Focus on deal acceleration and risk mitigation.`;
    }
    
    case 'contact': {
      return `Analyze this sales contact and provide relationship insights.

CONTACT: ${entityName}
- Title: ${entityData.title || 'Not specified'}
- Email: ${entityData.emailaddress1 || 'Not specified'}

IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Just write the content directly.

Structure your response as:

### Summary
A brief summary (2-3 sentences) of this contact's role and importance.

### Action Items
3-4 specific action items for engaging with this stakeholder.

${ACTION_ITEMS_FORMAT}

Focus on relationship building and influence mapping.`;
    }
    
    case 'activity': {
      const typeLabel = (entityData.type as string) || 'Not specified';
      const statusLabel = (entityData.status as string) || (entityData.draftStatus as string) || 'Not specified';
      const account = relatedData?.account as { name?: string; industry?: string | number | null } | undefined;
      const opp = relatedData?.opportunity as { name?: string; stage?: string; confidence?: number; amount?: number; closeDate?: string } | undefined;
      const oppLine = opp?.name
        ? `- Related opportunity: ${opp.name}`
          + (opp.stage ? `, stage ${opp.stage}` : '')
          + (opp.confidence != null ? `, confidence ${opp.confidence}%` : '')
          + (opp.amount != null ? `, $${Number(opp.amount).toLocaleString()}` : '')
          + (opp.closeDate ? `, expected close ${String(opp.closeDate).slice(0, 10)}` : '')
        : '- Related opportunity: none linked';
      // Context only — the generateEntityInsight skill owns the output structure.
      return `Analyze this sales activity in its business context.

ACTIVITY: ${entityName}
- Type: ${typeLabel}
- Status: ${statusLabel}
- Scheduled: ${entityData.scheduleddate ? String(entityData.scheduleddate).slice(0, 10) : 'n/a'}
- Notes / outcome: ${entityData.notes || 'No notes recorded'}

ACCOUNT: ${account?.name || 'Not linked'}${account?.industry ? ` (${industryLabel(account.industry) || account.industry})` : ''}
${oppLine}`;
    }
    
    default:
      return `Analyze this ${entityType} and provide actionable sales insights with specific next steps. IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Include a ### Summary section and a ### Action Items section formatted as one sequentially numbered Markdown list (one item per line).`;
  }
}

/**
 * Fire the AI summary skill in the background
 */
async function triggerFlowInBackground(
  userPrompt: string,
  entityType: EntityType,
  entityName: string,
  summaryId: string,
  updateSummary: (params: { id: string; changedFields: Partial<Omit<AISummary, 'id'>> }) => Promise<unknown>,
  locale: Locale,
) {
  try {
    const { executeFunction } = await import('@/lib/function-executor');
    // Activity insights use the structured skill (narrative + explained actions);
    // other entities keep the markdown summary skill.
    const useStructured = entityType === 'activity';
    const result = await executeFunction(useStructured ? 'generateEntityInsight' : 'generateEntitySummary', {
      data: userPrompt,
      entityType,
    }, {
      locale,
      standaloneAiOperation: {
        operationType: `insight.${entityType}`,
        queryText: `${entityType} insight · ${entityName}`,
      },
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Skill execution failed');
    }

    // generateEntityInsight → { insight, actions[] } (structured); generateEntitySummary
    // → validated markdown string. Both contracts are executor-guaranteed.
    let summaryContent: { summary: string; actionItems: string } | null = null;
    if (useStructured && result.data && typeof result.data === 'object') {
      const d = result.data as { insight?: string; actions?: unknown };
      const actions = normalizeInsightActions(d.actions);
      summaryContent = {
        summary: (d.insight || '').trim() || 'AI analysis completed.',
        actionItems: actions.length ? JSON.stringify(actions) : '',
      };
    } else if (typeof result.data === 'string') {
      summaryContent = { summary: result.data, actionItems: '' };
    }

    if (summaryContent) {
      await updateSummary({
        id: summaryId,
        changedFields: {
          status: STATUSES.completed,
          summary: summaryContent.summary,
          actionItems: summaryContent.actionItems,
          expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    } else {
      await updateSummary({
        id: summaryId,
        changedFields: {
          status: STATUSES.completed,
          summary: 'AI analysis completed.',
          expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    }
  } catch (error: unknown) {
    // Mark as failed if the flow call fails
    try {
      await updateSummary({
        id: summaryId,
        changedFields: {
          status: STATUSES.failed,
          summary: `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      });
    } catch (updateErr) {
      console.error('[AISummary] Failed to update status to failed:', updateErr);
    }
  }
}

/**
 * Generate a placeholder summary when no AI service is configured
 * Converts key values to human-readable labels
 */
function generatePlaceholderSummary(
  entityType: EntityType,
  entityData: Record<string, unknown>
): { summary: string; actionItems: string } {
  switch (entityType) {
    case 'account': {
      const name = entityData.name1 || entityData.name || 'This account';
      const industry = entityData.industry || '';
      return {
        summary: `### Account Overview\n\n${name} is ${industry ? `in the **${industry}** industry` : 'an account'}.\n\nReview recent activities and opportunities to identify growth potential and address any outstanding issues.`,
        actionItems: '### Recommended Actions\n\n- Review recent interaction history\n- Check open opportunities status\n- Verify contact information is current\n- Schedule follow-up if needed',
      };
    }
    
    case 'opportunity': {
      const name = entityData.name1 || entityData.name || 'This opportunity';
      const amount = entityData.totalamount || entityData.totalAmount || 0;
      const stageLabel = (entityData.stage as string) || '';
      return {
        summary: `### Opportunity Overview\n\n**${name}** with potential value of **$${Number(amount).toLocaleString()}**. Currently in *${stageLabel || 'unknown'}* stage.\n\nMonitor progress and address any blockers to advance the deal.`,
        actionItems: '### Recommended Actions\n\n- Review deal progress against timeline\n- Address any identified blockers\n- Prepare for next stage requirements\n- Update stakeholder on status',
      };
    }
    
    case 'contact': {
      const name = entityData.fullname || entityData.name || 'This contact';
      const title = entityData.title || '';
      return {
        summary: `### Contact Overview\n\n**${name}**${title ? `, *${title}*` : ''}\n\nKey stakeholder for the account. Maintain regular engagement and track relationship strength.`,
        actionItems: '### Recommended Actions\n\n- Verify contact details are current\n- Review communication history\n- Plan next engagement touchpoint\n- Update relationship notes',
      };
    }
    
    case 'activity': {
      const title = entityData.title || 'This activity';
      const typeLabel = (entityData.type as string) || '';
      return {
        summary: `### Activity Overview\n\n**${title}** *(${typeLabel || 'activity'})*\n\nReview the outcome and plan appropriate follow-up actions to maintain engagement momentum.`,
        actionItems: '### Recommended Actions\n\n- Document key discussion points\n- Identify follow-up actions\n- Update related opportunity status\n- Schedule next engagement',
      };
    }
    
    default:
      return {
        summary: '### Pending Analysis\n\nSummary generation pending. Configure Power Automate integration for AI-powered insights.',
        actionItems: '### Setup Required\n\n- Configure Power Automate flow URL in settings\n- Review entity details manually',
      };
  }
}

/**
 * Hook to get the latest AI summary for an entity
 */
export function useEntityAISummary(entityType: EntityType, entityId: string, insightType: string = 'sales') {
  const { data: allSummaries = [], isLoading, refetch } = useAISummaryList();
  
  const entityTypeLabel = ENTITY_TYPES[entityType];
  
  // Find the latest summary for this entity of the requested insight type.
  // Records with no `type` are legacy Sales Insight rows, so treat them as 'sales'.
  const summary = allSummaries
    .filter((s: AISummary) => s.entityType === entityTypeLabel && s.entityID === entityId && (s.type || 'sales') === insightType)
    .sort((a: AISummary, b: AISummary) => {
      const dateA = a.generatedOn ? new Date(a.generatedOn).getTime() : 0;
      const dateB = b.generatedOn ? new Date(b.generatedOn).getTime() : 0;
      return dateB - dateA;
    })[0] ?? null;
  
  const isExpired = summary?.expiresOn ? new Date(summary.expiresOn) < new Date() : false;
  // Timeout guard: if generating/pending for > 60s, treat as failed
  const generatingTooLong = !!(
    (summary?.status === STATUSES.generating || summary?.status === STATUSES.pending)
    && summary?.generatedOn
    && (Date.now() - new Date(summary.generatedOn).getTime()) > 60_000
  );
  const isGenerating = (summary?.status === STATUSES.generating || summary?.status === STATUSES.pending) && !generatingTooLong;
  const isCompleted = summary?.status === STATUSES.completed;
  const isFailed = summary?.status === STATUSES.failed || generatingTooLong;

  // True when a finished summary exists but was generated in a different language
  // than the one currently selected — the page should regenerate it.
  let localeMismatch = false;
  if (summary && isCompleted) {
    try {
      const genLocale = localStorage.getItem(aiSummaryLocaleKey(entityType, entityId));
      localeMismatch = !!genLocale && genLocale !== getLocale();
    } catch { /* ignore */ }
  }

  return {
    summary,
    isLoading,
    isExpired,
    isGenerating,
    isCompleted,
    isFailed,
    localeMismatch,
    refetch,
  };
}

/**
 * Hook to trigger AI summary generation in the background
 */
export function useAISummaryTrigger() {
  const queryClient = useQueryClient();
  const createAISummary = useCreateAISummary();
  const updateAISummary = useUpdateAISummary();
  const { settings } = useAppSettings();
  const { data: user } = useUser();
  
  const triggerSummary = useMutation({
    // Orchestration mutation: its mutationFn invokes createAISummary / updateAISummary
    // mutations, which already surface their own error toasts via the global
    // MutationCache handler. Suppress this layer to avoid duplicate toasts.
    meta: { suppressGlobalToast: true },
    mutationFn: async (params: TriggerSummaryParams) => {
      const { entityType, entityId, entityData, relatedData } = params;
      const locale = params.locale ?? getLocale();
      const entityTypeLabel = ENTITY_TYPES[entityType];
      // Remember the language this summary is generated in so the UI can detect a
      // stale summary after the user switches languages and regenerate it.
      try { localStorage.setItem(aiSummaryLocaleKey(entityType, entityId), locale); } catch { /* ignore */ }
      
      // Create a pending summary record first
      const summaryRecord = await createAISummary.mutateAsync({
        entityID: entityId,
        entityType: entityTypeLabel,
        type: 'sales',
        status: STATUSES.pending,
        summary: 'Generating AI summary...',
        generatedOn: new Date().toISOString(),
      });
      
      // If we have a Power Automate flow URL configured, trigger it
      if (user?.userPrincipalName) {
        // Update status to generating
        await updateAISummary.mutateAsync({
          id: summaryRecord.id,
          changedFields: {
            status: STATUSES.generating,
          },
        });
        
        // Build context-aware prompt
        const userPrompt = buildAIPrompt(entityType, entityData, relatedData);
        
        // Fire and forget - don't wait for the flow to complete
        triggerFlowInBackground(
          userPrompt,
          entityType,
          getEntityName(entityType, entityData),
          summaryRecord.id,
          updateAISummary.mutateAsync,
          locale,
        );
      } else {
        // No flow configured or no user - generate a placeholder summary
        const placeholderSummary = generatePlaceholderSummary(entityType, entityData);
        
        await updateAISummary.mutateAsync({
          id: summaryRecord.id,
          changedFields: {
            status: STATUSES.completed,
            summary: placeholderSummary.summary,
            actionItems: placeholderSummary.actionItems,
            expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          },
        });
      }
      
      return summaryRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aISummary-list'] });
    },
  });
  
  return {
    triggerSummary: triggerSummary.mutate,
    triggerSummaryAsync: triggerSummary.mutateAsync,
    isTriggering: triggerSummary.isPending,
    error: triggerSummary.error,
  };
}

/**
 * Hook wrapper for entity mutations that auto-triggers AI summary
 */
export function useWithAISummaryTrigger() {
  const { triggerSummary, isTriggering } = useAISummaryTrigger();
  
  const triggerForEntity = (
    entityType: EntityType,
    entityId: string,
    entityData: Record<string, unknown>,
    relatedData?: Record<string, unknown>
  ) => {
    // Trigger in background - don't block the main operation
    setTimeout(() => {
      triggerSummary({
        entityType,
        entityId,
        entityData,
        relatedData,
        locale: getLocale(),
      });
    }, 100);
  };
  
  return { triggerForEntity, isTriggering };
}
