import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCreateAISummary, useUpdateAISummary, useAISummaryList } from '@/generated/hooks/use-aisummary';
import type { AISummary, AISummaryEntityTypeKey, AISummaryStatusKey } from '@/generated/models/ai-summary-model';
import { useAppSettings } from './use-app-settings';
import { useUser } from './use-user';
import { invokeFlowForLLM } from '@/services/power-automate-service';
import { AccountTierKeyToLabel, AccountRegionKeyToLabel, AccountCreditstatusKeyToLabel } from '@/generated/models/account-model';
import type { AccountTierKey, AccountRegionKey, AccountCreditstatusKey } from '@/generated/models/account-model';
import { OpportunityStageKeyToLabel, OpportunityConfidencetrendKeyToLabel } from '@/generated/models/opportunity-model';
import type { OpportunityStageKey, OpportunityConfidencetrendKey } from '@/generated/models/opportunity-model';
import { ActivityTypeKeyToLabel, ActivityDraftstatusKeyToLabel, ActivityOutcomeKeyToLabel } from '@/generated/models/activity-model';
import type { ActivityTypeKey, ActivityDraftstatusKey, ActivityOutcomeKey } from '@/generated/models/activity-model';

// Entity type mapping
export const ENTITY_TYPE_KEYS: Record<string, AISummaryEntityTypeKey> = {
  account: 'EntityTypeKey0',
  opportunity: 'EntityTypeKey1',
  contact: 'EntityTypeKey2',
  activity: 'EntityTypeKey3',
} as const;

// Status mapping
export const STATUS_KEYS: Record<string, AISummaryStatusKey> = {
  pending: 'StatusKey0',
  generating: 'StatusKey1',
  completed: 'StatusKey2',
  failed: 'StatusKey3',
} as const;

export type EntityType = 'account' | 'opportunity' | 'contact' | 'activity';

interface TriggerSummaryParams {
  entityType: EntityType;
  entityId: string;
  entityData: Record<string, unknown>;
  relatedData?: Record<string, unknown>;
}

// Removed FlowRequestPayload - now using invokeFlowForLLM directly
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
      
      // Convert key values to labels
      const tierKey = entityData.tierKey as AccountTierKey | undefined;
      const tierLabel = tierKey ? AccountTierKeyToLabel[tierKey] : 'Not specified';
      const regionKey = entityData.regionKey as AccountRegionKey | undefined;
      const regionLabel = regionKey ? AccountRegionKeyToLabel[regionKey] : 'Not specified';
      const creditStatusKey = entityData.creditstatusKey as AccountCreditstatusKey | undefined;
      const creditStatusLabel = creditStatusKey ? AccountCreditstatusKeyToLabel[creditStatusKey] : 'Not specified';
      
      return `Analyze this sales account and provide actionable insights.

ACCOUNT: ${entityName}
- Industry: ${entityData.industry || 'Not specified'}
- Tier: ${tierLabel}
- Region: ${regionLabel}
- Credit Status: ${creditStatusLabel}
- Revenue: ${entityData.annualrevenue ? `$${Number(entityData.annualrevenue).toLocaleString()}` : 'Not specified'}

RELATED DATA
- Open Opportunities: ${opportunities?.length || 0}
- Recent Activities: ${activities?.length || 0}
- Contacts: ${contacts?.length || 0}

IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Just write the content directly.

Structure your response as:

### Summary
A brief summary (2-3 sentences) of the account's current status and potential.

### Action Items
3-4 specific action items as a bulleted list that the sales rep should take next.

Focus on actionable insights that help close deals and grow the relationship.`;
    }
    
    case 'opportunity': {
      // Convert key values to labels
      const stageKey = entityData.stageKey as OpportunityStageKey | undefined;
      const stageLabel = stageKey ? OpportunityStageKeyToLabel[stageKey] : 'Not specified';
      const trendKey = entityData.confidencetrendKey as OpportunityConfidencetrendKey | undefined;
      const trendLabel = trendKey ? OpportunityConfidencetrendKeyToLabel[trendKey] : 'Not specified';
      
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
3-4 specific action items as a bulleted list to advance this opportunity.

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
3-4 specific action items as a bulleted list for engaging with this stakeholder.

Focus on relationship building and influence mapping.`;
    }
    
    case 'activity': {
      // Convert key values to labels
      const typeKey = entityData.typeKey as ActivityTypeKey | undefined;
      const typeLabel = typeKey ? ActivityTypeKeyToLabel[typeKey] : 'Not specified';
      const statusKey = entityData.draftstatusKey as ActivityDraftstatusKey | undefined;
      const statusLabel = statusKey ? ActivityDraftstatusKeyToLabel[statusKey] : 'Not specified';
      const outcomeKey = entityData.outcomeKey as ActivityOutcomeKey | undefined;
      const outcomeLabel = outcomeKey ? ActivityOutcomeKeyToLabel[outcomeKey] : 'Not specified';
      
      return `Analyze this sales activity and provide follow-up insights.

ACTIVITY: ${entityName}
- Type: ${typeLabel}
- Status: ${statusLabel}
- Outcome: ${outcomeLabel}
- Notes: ${entityData.notes || 'No notes'}

IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Just write the content directly.

Structure your response as:

### Summary
A brief summary (2-3 sentences) of the activity outcome and implications.

### Action Items
3-4 specific follow-up action items as a bulleted list.

Focus on momentum and next steps.`;
    }
    
    default:
      return `Analyze this ${entityType} and provide actionable sales insights with specific next steps. IMPORTANT: Respond with plain Markdown text directly. Do NOT wrap your response in markdown code blocks. Include a ### Summary section and a ### Action Items section with bulleted points.`;
  }
}

/**
 * Extract summary from various Power Automate response formats
 */
function extractSummaryFromResponse(result: Record<string, unknown>): { summary: string; actionItems: string } | null {
  // Direct format: { summary: '...', actionItems: '...' }
  if (typeof result.summary === 'string') {
    return {
      summary: result.summary,
      actionItems: typeof result.actionItems === 'string' ? result.actionItems : '',
    };
  }
  
  // Nested format: { body: { summary: '...', actionItems: '...' } }
  if (result.body && typeof result.body === 'object') {
    const body = result.body as Record<string, unknown>;
    if (typeof body.summary === 'string') {
      return {
        summary: body.summary,
        actionItems: typeof body.actionItems === 'string' ? body.actionItems : '',
      };
    }
  }
  
  // Copilot Studio format: { text: '...' } or { message: '...' }
  if (typeof result.text === 'string') {
    return {
      summary: result.text,
      actionItems: '',
    };
  }
  
  if (typeof result.message === 'string' && !result.error) {
    return {
      summary: result.message,
      actionItems: '',
    };
  }
  
  // Response format: { response: '...' }
  if (typeof result.response === 'string') {
    return {
      summary: result.response,
      actionItems: '',
    };
  }
  
  return null;
}

/**
 * Fire the Power Automate flow in the background using the standard invokeFlowForLLM
 */
async function triggerFlowInBackground(
  flowUrl: string,
  userPrompt: string,
  summaryId: string,
  updateSummary: (params: { id: string; changedFields: Partial<Omit<AISummary, 'id'>> }) => Promise<unknown>
) {
  try {
    // Use the standard invokeFlowForLLM function which handles all the formatting
    const result = await invokeFlowForLLM(flowUrl, {
      messages: [
        { role: 'user', content: userPrompt }
      ],
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Flow request failed');
    }
    
    // Parse the response content
    let summaryContent: { summary: string; actionItems: string } | null = null;
    
    if (result.content) {
      try {
        const parsed = JSON.parse(result.content) as Record<string, unknown>;
        summaryContent = extractSummaryFromResponse(parsed);
      } catch {
        // Response might be plain text
        summaryContent = { summary: result.content, actionItems: '' };
      }
    }
    
    if (summaryContent) {
      await updateSummary({
        id: summaryId,
        changedFields: {
          statusKey: STATUS_KEYS.completed,
          summary: summaryContent.summary,
          actionItems: summaryContent.actionItems,
          expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    } else {
      // Flow succeeded but no summary returned - mark as completed with note
      await updateSummary({
        id: summaryId,
        changedFields: {
          statusKey: STATUS_KEYS.completed,
          summary: 'AI analysis request sent successfully. The flow will update this summary when processing completes.',
          expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    }
  } catch (error: unknown) {
    // Mark as failed if the flow call fails
    await updateSummary({
      id: summaryId,
      changedFields: {
        statusKey: STATUS_KEYS.failed,
        summary: `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    });
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
      const tierKey = entityData.tierKey as AccountTierKey | undefined;
      const tierLabel = tierKey ? AccountTierKeyToLabel[tierKey] : '';
      const industry = entityData.industry || '';
      return {
        summary: `### Account Overview\n\n${name} is ${industry ? `in the **${industry}** industry` : 'an account'}. ${tierLabel ? `Tier: **${tierLabel}**` : ''}\n\nReview recent activities and opportunities to identify growth potential and address any outstanding issues.`,
        actionItems: '### Recommended Actions\n\n- Review recent interaction history\n- Check open opportunities status\n- Verify contact information is current\n- Schedule follow-up if needed',
      };
    }
    
    case 'opportunity': {
      const name = entityData.name1 || entityData.name || 'This opportunity';
      const amount = entityData.totalamount || entityData.totalAmount || 0;
      const stageKey = entityData.stageKey as OpportunityStageKey | undefined;
      const stageLabel = stageKey ? OpportunityStageKeyToLabel[stageKey] : '';
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
      const typeKey = entityData.typeKey as ActivityTypeKey | undefined;
      const typeLabel = typeKey ? ActivityTypeKeyToLabel[typeKey] : '';
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
export function useEntityAISummary(entityType: EntityType, entityId: string) {
  const { data: allSummaries = [], isLoading, refetch } = useAISummaryList();
  
  const entityTypeKey = ENTITY_TYPE_KEYS[entityType];
  
  // Find the latest summary for this entity
  const summary = allSummaries
    .filter((s: AISummary) => s.entityTypeKey === entityTypeKey && s.entityID === entityId)
    .sort((a: AISummary, b: AISummary) => {
      const dateA = a.generatedOn ? new Date(a.generatedOn).getTime() : 0;
      const dateB = b.generatedOn ? new Date(b.generatedOn).getTime() : 0;
      return dateB - dateA;
    })[0] ?? null;
  
  const isExpired = summary?.expiresOn ? new Date(summary.expiresOn) < new Date() : false;
  const isGenerating = summary?.statusKey === STATUS_KEYS.generating || summary?.statusKey === STATUS_KEYS.pending;
  const isCompleted = summary?.statusKey === STATUS_KEYS.completed;
  const isFailed = summary?.statusKey === STATUS_KEYS.failed;
  
  return {
    summary,
    isLoading,
    isExpired,
    isGenerating,
    isCompleted,
    isFailed,
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
    mutationFn: async (params: TriggerSummaryParams) => {
      const { entityType, entityId, entityData, relatedData } = params;
      const entityTypeKey = ENTITY_TYPE_KEYS[entityType];
      
      // Create a pending summary record first
      const summaryRecord = await createAISummary.mutateAsync({
        entityID: entityId,
        entityTypeKey,
        statusKey: STATUS_KEYS.pending,
        summary: 'Generating AI summary...',
        generatedOn: new Date().toISOString(),
      });
      
      // If we have a Power Automate flow URL configured, trigger it
      const flowUrl = settings.powerAutomateFlowUrl;
      
      if (flowUrl && user?.userPrincipalName) {
        // Update status to generating
        await updateAISummary.mutateAsync({
          id: summaryRecord.id,
          changedFields: {
            statusKey: STATUS_KEYS.generating,
          },
        });
        
        // Build context-aware prompt
        const userPrompt = buildAIPrompt(entityType, entityData, relatedData);
        
        // Fire and forget - don't wait for the flow to complete
        // Pass userPrompt directly since invokeFlowForLLM handles the email internally
        triggerFlowInBackground(flowUrl, userPrompt, summaryRecord.id, updateAISummary.mutateAsync);
      } else {
        // No flow configured or no user - generate a placeholder summary
        const placeholderSummary = generatePlaceholderSummary(entityType, entityData);
        
        await updateAISummary.mutateAsync({
          id: summaryRecord.id,
          changedFields: {
            statusKey: STATUS_KEYS.completed,
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
      });
    }, 100);
  };
  
  return { triggerForEntity, isTriggering };
}
