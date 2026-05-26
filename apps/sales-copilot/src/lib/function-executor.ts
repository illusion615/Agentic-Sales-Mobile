/**
 * Function Executor for Copilot Function Calling
 * Executes functions based on LLM-generated function calls
 */

import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { ContactService } from '@/generated/services/contact-service';
import type { Account } from '@/generated/models/account-model';
import type { Opportunity } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { calculateEnhancedMatchScore, getConfidenceLevel, type EnhancedMatchScore } from './agent-utils';
import { touchAccountLastContacted } from './account-touch';
import { queryClient } from './query-client';
import { buildCSQuery } from './cs-context-builder';
import { getCopilotConfig, saveCopilotConfig, isCopilotStudioAvailable, COPILOT_STUDIO_AGENT_NAME } from '@/services/copilot-service';
import { MicrosoftCopilotStudioService } from '@/generated/services/MicrosoftCopilotStudioService';

/**
 * Escape special characters for OData queries
 * - Single quotes must be doubled in OData string literals
 * - Newlines and other control characters should be normalized
 */
function escapeODataString(value: string): string {
  return value
    .replace(/'/g, "''") // Escape single quotes
    .replace(/\r\n/g, ' ') // Replace CRLF with space
    .replace(/\r/g, ' ') // Replace CR with space
    .replace(/\n/g, ' '); // Replace LF with space to avoid OData issues
}

/**
 * Sanitize object fields that contain strings to be OData-safe
 * Also filters out undefined values that could cause issues
 */
function sanitizeForOData<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    // Skip undefined values
    if (value === undefined) continue;
    
    if (typeof value === 'string') {
      sanitized[key] = escapeODataString(value);
    } else if (value !== null) {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

export interface FunctionCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  // Query keys to invalidate after mutation (for UI refresh)
  invalidateQueries?: string[];
}

/**
 * Execute a function by name with given arguments
 */
export async function executeFunction(
  functionName: string,
  args: Record<string, unknown>,
  context: {
    userId?: string;
    userEmail?: string;
    /** Forwarded from copilot-agent so Copilot Studio queries can carry page/account/product context. */
    pageContext?: {
      currentPage?: string;
      summary?: string;
      pageData?: unknown;
    };
    /** Recent dialog turns; CS uses these to resolve pronouns ("this product", "that one"). */
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    /** Locale for the CS context header. */
    locale?: string;
  }
): Promise<FunctionCallResult> {
  console.log('[FN] ENTER executeFunction, name=' + functionName + ', args=' + JSON.stringify(args));

  try {
    switch (functionName) {
      // ===== Atomic Query: Accounts =====
      case 'queryAccounts':
      case 'searchAccounts':
      case 'getAccountDetails':
      case 'getAccountsByRegion':
      case 'getAccountsByTier':
      case 'getAccountsNeedingFollowUp': {
        const accounts = await AccountService.getAll();
        let filtered = [...accounts];

        // Legacy function aliases → map old args to new filter params
        const accountId = args.accountId as string | undefined;
        const nameQuery = (args.name as string || args.query as string || '').toLowerCase();
        const region = args.region as string | undefined;
        const tier = args.tier as string | undefined;
        const daysSinceLastContact = args.daysSinceLastContact as number | undefined;
        const sortBy = args.sortBy as string | undefined;
        const limit = (args.limit as number) || 20;

        // Single account by ID
        if (accountId) {
          const account = await AccountService.get(accountId);
          return { success: true, data: account };
        }

        // Apply filters
        if (nameQuery) filtered = filtered.filter((a: Account) => a.name1?.toLowerCase().includes(nameQuery));
        if (region) filtered = filtered.filter((a: Account) => a.region === region);
        if (tier) filtered = filtered.filter((a: Account) => a.tier === tier);
        if (daysSinceLastContact) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - daysSinceLastContact);
          filtered = filtered.filter((a: Account) => {
            if (!a.lastcontactedon) return true;
            return new Date(a.lastcontactedon) < cutoff;
          });
        }

        // Sort
        if (sortBy === 'lastContacted') {
          filtered.sort((a, b) => {
            const da = a.lastcontactedon ? new Date(a.lastcontactedon).getTime() : 0;
            const db = b.lastcontactedon ? new Date(b.lastcontactedon).getTime() : 0;
            return da - db;
          });
        } else if (sortBy === 'tier') {
          const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };
          filtered.sort((a, b) => (tierOrder[a.tier || 'C'] ?? 9) - (tierOrder[b.tier || 'C'] ?? 9));
        }

        return {
          success: true,
          data: filtered.slice(0, limit).map((a: Account) => ({
            id: a.id, name: a.name1, industry: a.industry,
            region: a.region, tier: a.tier, phone: a.phone,
            email: a.email, lastContactedOn: a.lastcontactedon,
          })),
        };
      }

      // ===== Atomic Query: Opportunities =====
      case 'queryOpportunities':
      case 'getMyOpportunities':
      case 'getTopOpportunities':
      case 'getOpportunitiesByAccount':
      case 'getOpportunitiesClosingSoon':
      case 'getSalesSummary': {
        const opportunities = await OpportunityService.getAll();
        let filtered = [...opportunities];

        const oppAccountId = args.accountId as string | undefined;
        const stage = args.stage as string | undefined;
        const closingWithinDays = args.closingWithinDays as number | undefined ?? (args.days as number | undefined);
        const minAmount = args.minAmount as number | undefined;
        const oppSortBy = args.sortBy as string | undefined;
        const oppLimit = (args.limit as number) || 20;

        // Filter by owner if userId provided
        if (context.userId) {
          filtered = filtered.filter((o: Opportunity) => o.ownerid === context.userId);
        }

        // Apply filters
        if (oppAccountId) filtered = filtered.filter((o: Opportunity) => o.account?.id === oppAccountId);
        if (stage) filtered = filtered.filter((o: Opportunity) => o.stage === stage);
        if (minAmount) filtered = filtered.filter((o: Opportunity) => o.totalamount >= minAmount);
        if (closingWithinDays) {
          const now = new Date();
          const cutoff = new Date(now.getTime() + closingWithinDays * 86400000);
          filtered = filtered.filter((o: Opportunity) => {
            if (!o.expectedclosedate) return false;
            const close = new Date(o.expectedclosedate);
            return close >= now && close <= cutoff;
          });
        }

        // Sort
        if (oppSortBy === 'amount' || functionName === 'getTopOpportunities') {
          filtered.sort((a, b) => b.totalamount - a.totalamount);
        } else if (oppSortBy === 'closeDate') {
          filtered.sort((a, b) => new Date(a.expectedclosedate || 0).getTime() - new Date(b.expectedclosedate || 0).getTime());
        }

        return {
          success: true,
          data: filtered.slice(0, oppLimit).map((o: Opportunity) => ({
            id: o.id, name: o.name1, account: o.account?.name1,
            amount: o.totalamount, stage: o.stage,
            confidence: o.confidence, expectedCloseDate: o.expectedclosedate,
          })),
        };
      }

      // ===== Atomic Query: Activities =====
      case 'queryActivities':
      case 'getTodayActivities':
      case 'getUpcomingActivities':
      case 'getActivitiesByAccount': {
        const activities = await ActivityService.getAll();
        let filteredAct = [...activities];

        const actAccountId = args.accountId as string | undefined;
        const actType = args.type as string | undefined;
        const dateRange = (args.dateRange as string) || (functionName === 'getTodayActivities' ? 'today' : undefined);
        const actStatus = args.status as string | undefined;
        const actSortBy = args.sortBy as string | undefined;
        const actLimit = (args.limit as number) || 20;

        // Apply filters
        if (actAccountId) filteredAct = filteredAct.filter((a: Activity) => a.account?.id === actAccountId);
        if (actType) filteredAct = filteredAct.filter((a: Activity) => a.type === actType);
        if (actStatus) filteredAct = filteredAct.filter((a: Activity) => a.draftStatus === actStatus);
        if (dateRange) {
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          if (dateRange === 'today') {
            filteredAct = filteredAct.filter((a: Activity) => a.scheduleddate?.startsWith(today));
          } else {
            const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 365;
            const cutoff = new Date(now.getTime() + days * 86400000);
            filteredAct = filteredAct.filter((a: Activity) => {
              if (!a.scheduleddate) return false;
              const d = new Date(a.scheduleddate);
              return d >= now && d <= cutoff;
            });
          }
        }

        // Sort by date by default
        if (actSortBy === 'type') {
          filteredAct.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
        } else {
          filteredAct.sort((a, b) => new Date(a.scheduleddate || 0).getTime() - new Date(b.scheduleddate || 0).getTime());
        }

        return {
          success: true,
          data: filteredAct.slice(0, actLimit).map((a: Activity) => ({
            id: a.id, title: a.title, type: a.type,
            account: a.account?.name1, scheduledDate: a.scheduleddate,
            status: a.draftStatus, notes: a.notes,
          })),
        };
      }

      // ===== Atomic Query: Contacts =====
      case 'queryContacts':
      case 'getContactsByAccount': {
        const contacts = await ContactService.getAll();
        let filteredContacts = [...contacts];

        const ctAccountId = args.accountId as string | undefined;
        const ctName = (args.name as string || '').toLowerCase();
        const ctTitle = (args.title as string || '').toLowerCase();
        const ctLimit = (args.limit as number) || 20;

        if (ctAccountId) filteredContacts = filteredContacts.filter((c: Contact) => c.account?.id === ctAccountId);
        if (ctName) filteredContacts = filteredContacts.filter((c: Contact) => c.fullname?.toLowerCase().includes(ctName));
        if (ctTitle) filteredContacts = filteredContacts.filter((c: Contact) => c.title?.toLowerCase().includes(ctTitle));

        return {
          success: true,
          data: filteredContacts.slice(0, ctLimit).map((c: Contact) => ({
            id: c.id, name: c.fullname, title: c.title,
            phone: c.phone, email: c.email, accountName: c.account?.name1,
          })),
        };
      }



      // ===== Draft Functions (return form card data) =====
      case 'draftActivity': {
        // Returns form card data for activity - no backend call
        const formCardData = {
          type: 'activity' as const,
          isNew: true,
          data: {
            title: args.title as string || '',
            type: args.type as string || 'visit',
            accountId: args.accountId as string || '',
            accountName: args.accountName as string || '',
            contactId: args.contactId as string || '',  // Add contactId support
            contactName: args.contactName as string || '',
            contactTitle: args.contactTitle as string || '',
            scheduledDate: args.scheduledDate as string || new Date().toISOString().split('T')[0],
            result: args.result as string || '',
            opportunityId: args.opportunityId as string || '',
            opportunityName: args.opportunityName as string || '',
            notes: args.notes as string || '',
            // I-8 Slice A: carry temporal tense from LLM into form state so
            // ActivityFormCard can show/hide result and derive draftstatusKey.
            temporalMode: args.temporalMode as string || '',
          },
        };
        return {
          success: true,
          data: formCardData,
        };
      }

      case 'draftOpportunity': {
        // Returns form card data for opportunity - no backend call
        const formCardData = {
          type: 'opportunity' as const,
          isNew: true,
          data: {
            name: args.name as string || '',
            accountId: args.accountId as string || '',  // Pass accountId directly from matched result
            accountName: args.accountName as string || '',
            amount: args.amount as number || 0,
            stage: args.stage as string || 'prospecting',
            confidence: args.confidence as number || 50,
            expectedCloseDate: args.expectedCloseDate as string || '',
            lastAction: args.lastAction as string || '',
            // I-8 Slice B-1 hybrid: when the LLM auto-suggests this opp from a
            // completed-activity narrative, it attaches _signals + _confidence
            // (renamed here to _signalConfidence to avoid collision with the
            // existing close-probability `confidence` field). Form-card reads
            // these to render a "Why this was suggested" header. Not persisted.
            _signals: args._signals,
            _signalConfidence: args._confidence,
          },
        };
        return {
          success: true,
          data: formCardData,
        };
      }

      case 'draftAccount': {
        // Returns form card data for account - no backend call
        const formCardData = {
          type: 'account' as const,
          isNew: true,
          data: {
            name: args.name as string || '',
            industry: args.industry as string || '',
            region: args.region as string || '',
            tier: args.tier as string || '',
            phone: args.phone as string || '',
            email: args.email as string || '',
            address: args.address as string || '',
            notes: args.notes as string || '',
          },
        };
        return {
          success: true,
          data: formCardData,
        };
      }

      case 'draftContact': {
        // Returns form card data for contact - no backend call
        const formCardData = {
          type: 'contact' as const,
          isNew: true,
          data: {
            fullName: args.fullName as string || '',
            accountId: args.accountId as string || '',  // Pass accountId directly from matched result
            accountName: args.accountName as string || '',
            title: args.title as string || '',
            phone: args.phone as string || '',
            email: args.email as string || '',
          },
        };
        return {
          success: true,
          data: formCardData,
        };
      }


      // ===== Update Functions =====
      case 'updateAccount': {
        const accountId = args.accountId as string;
        const accountName = args.accountName as string;
        
        // If no accountId, try to find by name
        let targetId = accountId;
        if (!targetId && accountName) {
          const accounts = await AccountService.getAll();
          const match = accounts.find((a: Account) => 
            a.name1?.toLowerCase().includes(accountName.toLowerCase())
          );
          if (match) targetId = match.id;
        }
        
        if (!targetId) {
          return { success: false, error: '缺少 accountId 或无法找到匹配的客户 / Missing accountId or cannot find matching account' };
        }
        
        // Build changed fields
        const accountChanges: Partial<Account> = {};
        if (args.name) accountChanges.name1 = args.name as string;
        if (args.industry) accountChanges.industry = args.industry as string;
        if (args.region) {
          accountChanges.region = args.region as string;
        }
        if (args.tier) {
          accountChanges.tier = args.tier as string;
        }
        if (args.phone) accountChanges.phone = args.phone as string;
        if (args.email) accountChanges.email = args.email as string;
        if (args.address) accountChanges.address = args.address as string;
        if (args.notes) accountChanges.notes = args.notes as string;
        
        if (Object.keys(accountChanges).length === 0) {
          return { success: false, error: '没有提供要更新的字段 / No fields to update' };
        }
        
        await AccountService.update(targetId, sanitizeForOData(accountChanges));
        const updatedAccount = await AccountService.get(targetId);
        
        return {
          success: true,
          data: {
            message: `客户信息已更新 / Account updated successfully`,
            account: updatedAccount,
            updatedFields: Object.keys(accountChanges),
          },
          invalidateQueries: ['account-list'],
        };
      }

      case 'updateOpportunity': {
        const opportunityId = args.opportunityId as string;
        const opportunityName = args.opportunityName as string;
        
        // If no opportunityId, try to find by name
        let targetId = opportunityId;
        if (!targetId && opportunityName) {
          const opportunities = await OpportunityService.getAll();
          const match = opportunities.find((o: Opportunity) => 
            o.name1?.toLowerCase().includes(opportunityName.toLowerCase())
          );
          if (match) targetId = match.id;
        }
        
        if (!targetId) {
          return { success: false, error: '缺少 opportunityId 或无法找到匹配的商机 / Missing opportunityId or cannot find matching opportunity' };
        }
        
        // Build changed fields
        const oppChanges: Partial<Opportunity> = {};
        if (args.name) oppChanges.name1 = args.name as string;
        if (args.amount !== undefined) oppChanges.totalamount = args.amount as number;
        if (args.stage) {
          oppChanges.stage = args.stage as string;
        }
        if (args.confidence !== undefined) oppChanges.confidence = args.confidence as number;
        if (args.expectedCloseDate) oppChanges.expectedclosedate = args.expectedCloseDate as string;
        if (args.lastAction) oppChanges.lastaction = args.lastAction as string;

        // When stage transitions to a terminal state (won/lost), stamp closedon
        // with the current time so dashboards (Q Perf, etc.) attribute the deal
        // to the correct quarter. Caller-provided closedon wins if supplied.
        if (oppChanges.stage === 'won' || oppChanges.stage === 'lost') {
          oppChanges.closedon = (args.closedon as string) || new Date().toISOString();
        }

        if (Object.keys(oppChanges).length === 0) {
          return { success: false, error: '没有提供要更新的字段 / No fields to update' };
        }
        
        await OpportunityService.update(targetId, sanitizeForOData(oppChanges));
        const updatedOpp = await OpportunityService.get(targetId);
        
        return {
          success: true,
          data: {
            message: `商机信息已更新 / Opportunity updated successfully`,
            opportunity: updatedOpp,
            updatedFields: Object.keys(oppChanges),
          },
          invalidateQueries: ['opportunity-list'],
        };
      }

      case 'updateActivity': {
        const activityId = args.activityId as string;
        const activityTitle = args.activityTitle as string;
        
        // If no activityId, try to find by title
        let targetId = activityId;
        if (!targetId && activityTitle) {
          const activities = await ActivityService.getAll();
          const match = activities.find((a: Activity) => 
            a.title?.toLowerCase().includes(activityTitle.toLowerCase())
          );
          if (match) targetId = match.id;
        }
        
        if (!targetId) {
          return { success: false, error: '缺少 activityId 或无法找到匹配的活动 / Missing activityId or cannot find matching activity' };
        }
        
        // Build changed fields
        // Build changed fields
        const actChanges: Partial<Activity> = {};
        if (args.title) actChanges.title = args.title as string;
        if (args.type) {
          actChanges.type = args.type as string;
        }
        // Handle status update - normalize user-friendly terms to draftStatus label
        if (args.status) {
          const statusStr = (args.status as string).toLowerCase();
          const statusMap: Record<string, string> = {
            'draft': 'draft', 'confirmed': 'confirmed', 'completed': 'completed', 'cancelled': 'cancelled', 'canceled': 'cancelled',
            'done': 'completed', 'complete': 'completed', 'finished': 'completed', 'cancel': 'cancelled', 'confirm': 'confirmed',
            '草稿': 'draft', '已确认': 'confirmed', '确认': 'confirmed',
            '已完成': 'completed', '完成': 'completed', '已取消': 'cancelled', '取消': 'cancelled',
          };
          if (statusMap[statusStr]) {
            actChanges.draftStatus = statusMap[statusStr];
          }
        }
        if (args.scheduledDate) actChanges.scheduleddate = args.scheduledDate as string;
        if (args.notes) actChanges.notes = args.notes as string;
        // result maps to Activity.outcome column
        if (args.result) {
          actChanges.outcome = args.result as string;
        }
        
        // Handle opportunity binding - find by ID or name
        if (args.opportunityId || args.opportunityName) {
          const opportunities = await OpportunityService.getAll();
          let targetOpportunity: Opportunity | undefined;
          
          if (args.opportunityId) {
            targetOpportunity = opportunities.find((o: Opportunity) => o.id === args.opportunityId);
          } else if (args.opportunityName) {
            const oppNameLower = (args.opportunityName as string).toLowerCase();
            targetOpportunity = opportunities.find((o: Opportunity) => 
              o.name1?.toLowerCase().includes(oppNameLower)
            );
          }
          
          if (targetOpportunity) {
            actChanges.opportunity = { id: targetOpportunity.id, name1: targetOpportunity.name1 };
          }
        }
        
        // Handle account binding - find by ID or name
        if (args.accountId || args.accountName) {
          const accounts = await AccountService.getAll();
          let targetAccount: Account | undefined;
          
          if (args.accountId) {
            targetAccount = accounts.find((a: Account) => a.id === args.accountId);
          } else if (args.accountName) {
            const accNameLower = (args.accountName as string).toLowerCase();
            targetAccount = accounts.find((a: Account) => 
              a.name1?.toLowerCase().includes(accNameLower)
            );
          }
          
          if (targetAccount) {
            actChanges.account = { id: targetAccount.id, name1: targetAccount.name1 };
          }
        }
        
        if (Object.keys(actChanges).length === 0) {
          return { success: false, error: '没有提供要更新的字段 / No fields to update' };
        }
        
        await ActivityService.update(targetId, sanitizeForOData(actChanges));
        const updatedActivity = await ActivityService.get(targetId);

        // Writeback: any activity update against an account counts as a touch,
        // so dashboards (Coverage, At-Risk) stay accurate. Use scheduleddate if
        // available, else now. Always invalidate account-list cache.
        const touchedAccountId = updatedActivity?.account?.id;
        if (touchedAccountId) {
          await touchAccountLastContacted(touchedAccountId, updatedActivity?.scheduleddate);
        }

        return {
          success: true,
          data: {
            message: `活动记录已更新 / Activity updated successfully`,
            activity: updatedActivity,
            updatedFields: Object.keys(actChanges),
          },
          invalidateQueries: touchedAccountId ? ['activity-list', 'account-list'] : ['activity-list'],
        };
      }

      case 'updateContact': {
        const contactId = args.contactId as string;
        const contactName = args.contactName as string;
        
        // If no contactId, try to find by name
        let targetId = contactId;
        if (!targetId && contactName) {
          const contacts = await ContactService.getAll();
          const match = contacts.find((c: Contact) => 
            c.fullname?.toLowerCase().includes(contactName.toLowerCase())
          );
          if (match) targetId = match.id;
        }
        
        if (!targetId) {
          return { success: false, error: '缺少 contactId 或无法找到匹配的联系人 / Missing contactId or cannot find matching contact' };
        }
        
        // Build changed fields
        const contactChanges: Partial<Contact> = {};
        if (args.fullName) contactChanges.fullname = args.fullName as string;
        if (args.title) contactChanges.title = args.title as string;
        if (args.phone) contactChanges.phone = args.phone as string;
        if (args.email) contactChanges.email = args.email as string;
        
        if (Object.keys(contactChanges).length === 0) {
          return { success: false, error: '没有提供要更新的字段 / No fields to update' };
        }
        
        await ContactService.update(targetId, sanitizeForOData(contactChanges));
        const updatedContact = await ContactService.get(targetId);
        
        return {
          success: true,
          data: {
            message: `联系人信息已更新 / Contact updated successfully`,
            contact: updatedContact,
            updatedFields: Object.keys(contactChanges),
          },
          invalidateQueries: ['contact-list'],
        };
      }

      // ===== Form Fill Functions (legacy) =====
      case 'fillActivityForm': {
        // This function doesn't call any backend service
        // It just returns the extracted data for the frontend to fill the form
        const formData = {
          title: args.title as string || '',
          accountName: args.accountName as string || '',
          contactName: args.contactName as string || '',
          visitDate: args.visitDate as string || new Date().toISOString().split('T')[0],
          result: args.result as string || '',
          nextStep: args.nextStep as string || '',
          opportunityIntent: args.opportunityIntent as string || '',
        };
        return {
          success: true,
          data: formData,
        };
      }

      case 'externalKnowledgeQuery':
      case 'queryCopilotStudio': {
        // Safety net: auto-fill query from context if the orchestrator omitted it
        const query = (args.query as string) || (context.conversationHistory?.filter(m => m.role === 'user').pop()?.content) || '';
        console.log('[CS] ENTER queryCopilotStudio, query=' + query);
        if (!query) return { success: false, error: '缺少 query 参数' };

        // Enrich the user query with page/account/product/dialog context so
        // Copilot Studio can disambiguate intent (boss directive 2026-05-17).
        const enrichedQuery = buildCSQuery({
          userQuery: query,
          locale: context.locale,
          pageContext: context.pageContext,
          conversationHistory: context.conversationHistory,
          user: { id: context.userId, email: context.userEmail },
        });
        console.log('[CS] enriched query length:', enrichedQuery.length, 'preview:', enrichedQuery.slice(0, 200));

        // Guard: check availability via the single source of truth
        if (!isCopilotStudioAvailable()) {
          console.log('[CS] NOT AVAILABLE - connector not ready');
          return { 
            success: false, 
            error: 'Copilot Studio 连接器未就绪' 
          };
        }

        try {
          const csConfig = getCopilotConfig();
          console.log('[CS] Calling MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2...');
          const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
            csConfig?.agentName || COPILOT_STUDIO_AGENT_NAME,
            { message: enrichedQuery, notificationUrl: 'https://notificationurlplaceholder' },
          );

          if (!result.success) {
            console.error('[CS] SDK connector error:', result.error);
            return {
              success: false,
              error: result.error?.message ?? 'Copilot Studio 调用失败',
            };
          }

          // ExecuteCopilotAsyncV2 returns void type but actual data is in result.data
          const responseData = result.data as unknown as { lastResponse?: string; responses?: string[]; conversationId?: string } | undefined;
          const answer = responseData?.lastResponse || responseData?.responses?.join('\n\n') || '';
          const conversationId = responseData?.conversationId;
          console.log('[CS] FINAL answer length:', answer.length, 'conversationId:', conversationId);

          // Persist conversation ID for multi-turn
          if (conversationId && csConfig) {
            saveCopilotConfig({ ...csConfig, conversationId });
          }

          return {
            success: true,
            data: {
              answer: answer || '(no reply)',
              source: 'Copilot Studio',
              conversationId,
            },
          };
        } catch (sdkError: unknown) {
          console.error('[CS] Copilot Studio SDK error:', sdkError);
          return {
            success: false,
            error: sdkError instanceof Error ? sdkError.message : 'Copilot Studio 请求失败',
          };
        }
      }

      // ===== Fuzzy Matching Functions =====
      case 'fuzzyMatchAccount': {
        const query = (args.query as string || '');
        const contextStr = (args.context as string || '');
        const accounts = await AccountService.getAll();
        
        // Enhanced score-based matching with Levenshtein
        interface MatchResult {
          id: string;
          name: string;
          industry?: string;
          region?: string;
          score: number;
          matchType: 'exact' | 'contains' | 'fuzzy' | 'levenshtein';
          scoreBreakdown?: EnhancedMatchScore['breakdown'];
        }
        
        const matches: MatchResult[] = accounts
          .map((a: Account) => {
            const name = a.name1 || '';
            const enhancedScore = calculateEnhancedMatchScore(query, name, contextStr || a.industry);
            
            return {
              id: a.id,
              name: a.name1 || '',
              industry: a.industry,
              region: a.region,
              score: enhancedScore.score,
              matchType: enhancedScore.matchType,
              scoreBreakdown: enhancedScore.breakdown,
            };
          })
          .filter((m: MatchResult) => m.score > 20)
          .sort((a: MatchResult, b: MatchResult) => b.score - a.score)
          .slice(0, 5);
        
        // Use configurable confidence thresholds
        const bestMatch = matches[0];
        const confidence = bestMatch ? getConfidenceLevel(bestMatch.score) : 'none';
        
        return {
          success: true,
          data: {
            matches,
            confidence,
            needsConfirmation: confidence !== 'high' || matches.length > 1,
            exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null,
          },
        };
      }

      case 'fuzzyMatchContact': {
        const query = (args.query as string || '');
        const accountId = args.accountId as string | undefined;
        const contacts = await ContactService.getAll();
        
        interface ContactMatchResult {
          id: string;
          name: string;
          title?: string;
          accountName?: string;
          accountId?: string;
          score: number;
          matchType: 'exact' | 'contains' | 'fuzzy' | 'levenshtein';
        }
        
        const matches: ContactMatchResult[] = contacts
          .filter((c: Contact) => !accountId || c.account?.id === accountId)
          .map((c: Contact) => {
            const name = c.fullname || '';
            const enhancedScore = calculateEnhancedMatchScore(query, name);
            
            return {
              id: c.id,
              name: c.fullname || '',
              title: c.title,
              accountName: c.account?.name1,
              accountId: c.account?.id,
              score: enhancedScore.score,
              matchType: enhancedScore.matchType,
            };
          })
          .filter((m: ContactMatchResult) => m.score > 20)
          .sort((a: ContactMatchResult, b: ContactMatchResult) => b.score - a.score)
          .slice(0, 5);
        
        const bestMatch = matches[0];
        const confidence = bestMatch ? getConfidenceLevel(bestMatch.score) : 'none';
        
        return {
          success: true,
          data: {
            matches,
            confidence,
            needsConfirmation: confidence !== 'high' || matches.length > 1,
            exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null,
          },
        };
      }

      case 'fuzzyMatchOpportunity': {
        const query = (args.query as string || '');
        const accountId = args.accountId as string | undefined;
        const opportunities = await OpportunityService.getAll();
        
        interface OppMatchResult {
          id: string;
          name: string;
          accountName?: string;
          amount?: number;
          stage?: string;
          score: number;
          matchType: 'exact' | 'contains' | 'fuzzy' | 'levenshtein';
        }
        
        const matches: OppMatchResult[] = opportunities
          .filter((o: Opportunity) => !accountId || o.account?.id === accountId)
          .map((o: Opportunity) => {
            const name = o.name1 || '';
            const enhancedScore = calculateEnhancedMatchScore(query, name);
            
            return {
              id: o.id,
              name: o.name1 || '',
              accountName: o.account?.name1,
              amount: o.totalamount,
              stage: o.stage,
              score: enhancedScore.score,
              matchType: enhancedScore.matchType,
            };
          })
          .filter((m: OppMatchResult) => m.score > 20)
          .sort((a: OppMatchResult, b: OppMatchResult) => b.score - a.score)
          .slice(0, 5);
        
        const bestMatch = matches[0];
        const confidence = bestMatch ? getConfidenceLevel(bestMatch.score) : 'none';
        
        return {
          success: true,
          data: {
            matches,
            confidence,
            needsConfirmation: confidence !== 'high' || matches.length > 1,
            exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null,
          },
        };
      }

      // ===== Fuzzy Match Activity (Deduplication) =====
      case 'fuzzyMatchActivity': {
        const query = args.query as string;
        const accountIdArg = args.accountId as string | undefined;
        const dateRange = args.dateRange as string | undefined;
        
        if (!query) {
          return { success: false, error: '缺少 query 参数' };
        }
        
        // Get all activities
        let allActivities = await ActivityService.getAll();
        
        // Filter by account if specified
        if (accountIdArg) {
          allActivities = allActivities.filter((a: Activity) => a.account?.id === accountIdArg);
        }
        
        // Filter by date range if specified
        if (dateRange) {
          const now = new Date();
          let daysBack = 30; // default
          if (dateRange === '7days') daysBack = 7;
          else if (dateRange === '14days') daysBack = 14;
          else if (dateRange === '30days') daysBack = 30;
          else if (dateRange === '60days') daysBack = 60;
          else if (dateRange === '90days') daysBack = 90;
          
          const cutoffDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
          allActivities = allActivities.filter((a: Activity) => {
            if (!a.scheduleddate) return false;
            const actDate = new Date(a.scheduleddate);
            return actDate >= cutoffDate;
          });
        }
        
        // Calculate similarity scores
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 1);
        
        interface ActivityMatch {
          id: string;
          name: string;
          title: string;
          subtitle?: string;
          matchType: 'exact' | 'contains' | 'fuzzy';
          type?: string;
          scheduleddate?: string;
          accountId?: string;
          accountName: string;
          notes?: string;
          score: number;
        }
        
        const scoredActivities: ActivityMatch[] = allActivities.map((activity: Activity) => {
          const titleLower = (activity.title || '').toLowerCase();
          const notesLower = (activity.notes || '').toLowerCase();
          const combinedText = `${titleLower} ${notesLower}`;
          
          let score = 0;
          let matchType: 'exact' | 'contains' | 'fuzzy' = 'fuzzy';

          // Exact title match: high score
          if (titleLower === queryLower) {
            score = 100;
            matchType = 'exact';
          } else if (titleLower.includes(queryLower)) {
            score = 80;
            matchType = 'contains';
          } else {
            // Word-based matching
            for (const word of queryWords) {
              if (combinedText.includes(word)) {
                score += 15;
              }
            }
            // Boost for title matches
            for (const word of queryWords) {
              if (titleLower.includes(word)) {
                score += 10;
              }
            }
          }
          
          // Bonus for recent activities
          if (activity.scheduleddate) {
            const actDate = new Date(activity.scheduleddate);
            const daysDiff = Math.floor((new Date().getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 7) score += 10;
            else if (daysDiff <= 14) score += 5;
          }

          // Word/recency bonuses can stack past 100; cap so the UI confidence colors stay meaningful.
          if (score > 100) score = 100;
          
          const accountName = activity.account?.name1 || '未关联客户';
          // Build a human-readable subtitle: account · type · date
          const dateStr = activity.scheduleddate
            ? new Date(activity.scheduleddate).toLocaleDateString()
            : '';
          const subtitleParts = [accountName, activity.type, dateStr].filter(Boolean) as string[];

          return {
            id: activity.id,
            // The match-selection UI renders `name` + `subtitle`. Activities use `title` as their display name.
            name: activity.title || '(无标题)',
            title: activity.title,
            subtitle: subtitleParts.join(' · '),
            matchType,
            type: activity.type,
            scheduleddate: activity.scheduleddate,
            accountId: activity.account?.id,
            accountName,
            notes: activity.notes,
            score,
          };
        });
        
        // Filter and sort by score
        const matches = scoredActivities
          .filter((a: ActivityMatch) => a.score >= 25)
          .sort((a: ActivityMatch, b: ActivityMatch) => b.score - a.score)
          .slice(0, 5);
        
        const bestMatch = matches[0];
        let confidence: 'high' | 'medium' | 'low' = 'low';
        
        if (bestMatch) {
          if (bestMatch.score >= 80) confidence = 'high';
          else if (bestMatch.score >= 50) confidence = 'medium';
        }
        
        return {
          success: true,
          data: {
            matches,
            confidence,
            needsConfirmation: confidence !== 'high' || matches.length > 1,
            exactMatch: confidence === 'high' && matches.length === 1 ? bestMatch : null,
            message: matches.length > 0 
              ? `找到 ${matches.length} 条可能匹配的活动记录`
              : '未找到类似的活动记录，这是新活动',
          },
        };
      }


      // ===== Batch Draft Function =====
      case 'batchDraft': {
        const items = args.items as Array<{ type: string; data: Record<string, unknown> }>;
        if (!items || !Array.isArray(items) || items.length === 0) {
          return { success: false, error: '缺少 items 参数或 items 为空' };
        }
        
        // Extract top-level account info to inject into items that don't have their own
        const topLevelAccountId = args.accountId as string | undefined;
        const topLevelAccountName = args.accountName as string | undefined;
        console.log('[batchDraft] topLevelAccountId:', topLevelAccountId, 'topLevelAccountName:', topLevelAccountName);

        // ---- Per-item account fuzzy match (Item 5 fix) ----
        // The LLM often emits a batch like:
        //   [{type:'activity', data:{accountName:'Manchester University NHS Foundation Trust'}},
        //    {type:'activity', data:{accountName:'Oxford University Hospitals'}}, ...]
        // with NO accountId on each item AND no top-level account. The form
        // cards then can't link to a real account. Here we fuzzy-resolve each
        // item's accountName → accountId once, sharing a single AccountService
        // fetch across the loop.
        let allAccountsCache: Account[] | null = null;
        const resolveAccountIdByName = async (name: string): Promise<string | undefined> => {
          if (!name) return undefined;
          if (!allAccountsCache) {
            try {
              allAccountsCache = await AccountService.getAll();
            } catch (err) {
              console.warn('[batchDraft] AccountService.getAll failed during fuzzy match:', err);
              allAccountsCache = [];
            }
          }
          let bestId: string | undefined;
          let bestScore = 0;
          for (const a of allAccountsCache) {
            const candidateName = a.name1 || '';
            if (!candidateName) continue;
            const s = calculateEnhancedMatchScore(name, candidateName);
            if (s.score > bestScore) {
              bestScore = s.score;
              bestId = a.id;
            }
          }
          // 70 = "high confidence" in agent-utils — same threshold the single
          // fuzzyMatchAccount tool uses to auto-pick without disambiguation.
          return bestScore >= 70 ? bestId : undefined;
        };
        
        // Process each item and return batch form card data
        const formCards = await Promise.all(items.map(async (item: { type: string; data: Record<string, unknown> }, index: number) => {
          const itemType = item.type || 'activity';
          const itemData = { ...(item.data || {}) };
          
          // Inject top-level account info if item doesn't have its own (for activity, opportunity, contact)
          if (['activity', 'opportunity', 'contact'].includes(itemType)) {
            if (!itemData.accountId && topLevelAccountId) {
              itemData.accountId = topLevelAccountId;
            }
            if (!itemData.accountName && topLevelAccountName) {
              itemData.accountName = topLevelAccountName;
            }
            // Fuzzy-resolve when we still have a name but no id (the common
            // weekly-plan / batch-create case).
            if (!itemData.accountId && typeof itemData.accountName === 'string' && itemData.accountName) {
              const resolved = await resolveAccountIdByName(itemData.accountName);
              if (resolved) {
                itemData.accountId = resolved;
                console.log('[batchDraft] item', index, 'fuzzy-matched accountName "' + itemData.accountName + '" -> accountId', resolved);
              } else {
                console.log('[batchDraft] item', index, 'no high-confidence account match for "' + itemData.accountName + '"');
              }
            }
          }
          console.log('[batchDraft] item', index, 'type:', itemType, 'accountId:', itemData.accountId, 'accountName:', itemData.accountName);
          
          return {
            type: itemType as 'activity' | 'opportunity' | 'account' | 'contact',
            isNew: true,
            data: itemData,
            batchIndex: index,
          };
        }));

        // Weekly-plan dedup: if any activity item collides with an existing
        // activity on the same account + same calendar day, attach a
        // _duplicateOf hint so the form card can warn the user. Reads the
        // already-fetched list from the query cache; if the cache is empty
        // we skip silently (no extra round trip).
        try {
          const cachedLists = queryClient
            .getQueriesData<Activity[]>({ queryKey: ['activity-list'] })
            .map(([, data]) => data)
            .filter((d): d is Activity[] => Array.isArray(d));
          const existing: Activity[] = cachedLists.flat();
          if (existing.length > 0) {
            const dayOf = (iso: unknown): string => {
              if (typeof iso !== 'string' || !iso) return '';
              return iso.slice(0, 10);
            };
            for (const card of formCards) {
              if (card.type !== 'activity') continue;
              const itemAccountId = card.data.accountId as string | undefined;
              const itemAccountName = card.data.accountName as string | undefined;
              const itemDay = dayOf(card.data.scheduleddate ?? card.data.scheduledAt);
              if (!itemDay) continue;
              const match = existing.find((a) => {
                if (dayOf(a.scheduleddate) !== itemDay) return false;
                if (itemAccountId && a.account?.id === itemAccountId) return true;
                if (
                  !itemAccountId &&
                  itemAccountName &&
                  a.account?.name1 &&
                  a.account.name1.toLowerCase() === itemAccountName.toLowerCase()
                )
                  return true;
                return false;
              });
              if (match) {
                (card.data as Record<string, unknown>)._duplicateOf = {
                  existingId: match.id,
                  subject: match.title,
                  scheduleddate: match.scheduleddate,
                };
              }
            }
          }
        } catch (err) {
          console.warn('[batchDraft] dedup skipped:', err);
        }
        
        return {
          success: true,
          data: {
            isBatch: true,
            items: formCards,
            totalCount: formCards.length,
          },
        };
      }

      default:
        return { success: false, error: `未知函数: ${functionName}` };
    }
  } catch (error: unknown) {
    console.error('[FunctionExecutor] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '执行函数时发生错误',
    };
  }
}