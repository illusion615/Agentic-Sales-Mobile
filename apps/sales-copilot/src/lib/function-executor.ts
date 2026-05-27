/**
 * Function Executor for Copilot Function Calling
 * Executes functions based on LLM-generated function calls
 */

import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { ContactService } from '@/generated/services/contact-service';
import { getAdminMode } from '@/lib/i18n';
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
  message?: string;
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

  // Shared helper: resolve accountName → accountId via fuzzy match.
  // Used by queryOpportunities, queryActivities, queryContacts when the
  // orchestrator passes a user-typed name instead of an exact ID.
  const resolveAccountByName = async (name: string): Promise<string | undefined> => {
    if (!name) return undefined;
    const accounts = await AccountService.getAll();
    let bestId: string | undefined;
    let bestScore = 0;
    for (const a of accounts) {
      if (!a.name1) continue;
      const s = calculateEnhancedMatchScore(name, a.name1);
      if (s.score > bestScore) { bestScore = s.score; bestId = a.id; }
    }
    if (bestScore >= 50 && bestId) {
      console.log(`[FN] resolveAccountByName: "${name}" → id=${bestId} (score=${bestScore})`);
      return bestId;
    }
    console.log(`[FN] resolveAccountByName: "${name}" → no match (best score=${bestScore})`);
    return undefined;
  };

  try {
    switch (functionName) {
      // ===== Atomic Query: Accounts =====
      case 'queryAccounts': {
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
      case 'queryOpportunities': {
        const opportunities = await OpportunityService.getAll();
        let filtered = [...opportunities];

        let oppAccountId = args.accountId as string | undefined;
        // Fuzzy-resolve accountName → accountId if user typed a name
        if (!oppAccountId && args.accountName) {
          oppAccountId = await resolveAccountByName(args.accountName as string);
        }
        const stage = args.stage as string | undefined;
        const closingWithinDays = args.closingWithinDays as number | undefined ?? (args.days as number | undefined);
        const minAmount = args.minAmount as number | undefined;
        const oppSortBy = args.sortBy as string | undefined;
        const oppLimit = (args.limit as number) || 20;

        // Filter by owner if userId provided (skip in admin mode)
        if (context.userId && !getAdminMode()) {
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
        if (oppSortBy === 'amount') {
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
      case 'queryActivities': {
        const activities = await ActivityService.getAll();
        let filteredAct = [...activities];

        let actAccountId = args.accountId as string | undefined;
        // Fuzzy-resolve accountName → accountId if user typed a name
        if (!actAccountId && args.accountName) {
          actAccountId = await resolveAccountByName(args.accountName as string);
        }
        const actType = args.type as string | undefined;
        const dateRange = args.dateRange as string | undefined;
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
      case 'queryContacts': {
        const contacts = await ContactService.getAll();
        let filteredContacts = [...contacts];

        let ctAccountId = args.accountId as string | undefined;
        // Fuzzy-resolve accountName → accountId if user typed a name
        if (!ctAccountId && args.accountName) {
          ctAccountId = await resolveAccountByName(args.accountName as string);
        }
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


      // ===== Planning Functions =====
      case 'suggestPlan': {
        const targetDate = args.targetDate as string || (() => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow.toISOString().split('T')[0];
        })();
        const period = args.period as string || 'day';
        const focus = args.focus as string || '';
        const maxTasks = (args.maxTasks as number) || 5;

        // 1. Fetch active opportunities (sorted by close date urgency)
        const allOpps = await OpportunityService.getAll();
        const activeOpps = allOpps
          .filter((o) => o.stage !== 'won' && o.stage !== 'lost')
          .sort((a, b) => {
            const da = a.expectedclosedate ? new Date(a.expectedclosedate).getTime() : Infinity;
            const db = b.expectedclosedate ? new Date(b.expectedclosedate).getTime() : Infinity;
            return da - db;
          })
          .slice(0, 15);

        // 2. Fetch existing activities for target date/period
        const allActivities = await ActivityService.getAll();
        const targetStart = new Date(targetDate + 'T00:00:00');
        const targetEnd = period === 'week'
          ? new Date(targetStart.getTime() + 7 * 24 * 60 * 60 * 1000)
          : new Date(targetStart.getTime() + 24 * 60 * 60 * 1000);
        const existingActivities = allActivities.filter((a) => {
          const d = new Date(a.scheduleddate);
          return d >= targetStart && d < targetEnd;
        });

        // 3. Fetch accounts sorted by last contacted (least recent first)
        const allAccounts = await AccountService.getAll();
        const accountsNeedingContact = allAccounts
          .filter((a) => a.lastcontactedon)
          .sort((a, b) => new Date(a.lastcontactedon!).getTime() - new Date(b.lastcontactedon!).getTime())
          .slice(0, 10);

        // 4. Get conversation history for context (recent suggestions)
        const recentHistory = (context.conversationHistory || []).slice(-4)
          .map((m) => `${m.role}: ${m.content.slice(0, 300)}`).join('\n');

        // 5. Build LLM prompt
        const isZh = (context.locale || 'en') === 'zh-Hans';
        const systemPrompt = isZh
          ? `你是一个资深销售教练。基于以下数据为销售代表规划 ${targetDate} ${period === 'week' ? '起一周' : '当天'}的工作计划。

要求：
- 生成最多 ${maxTasks} 个具体的、可操作的任务建议
- 每个任务必须包含：title（具体标题含客户名和目的）、type（visit/call/meeting/email/other）、accountName、scheduledDate（YYYY-MM-DD）、notes（规划理由）
- 优先级排序：到期商机跟进 > 长期未联系客户回访 > 高价值商机推进 > 例行维护
- 避免和已有活动冲突${focus ? `\n- 重点方向：${focus}` : ''}
- 返回 JSON 数组：[{"title":"...", "type":"...", "accountName":"...", "scheduledDate":"...", "notes":"..."}]
- 只返回 JSON，不要其他内容`
          : `You are a senior sales coach. Based on the data below, plan ${period === 'week' ? 'a week of' : ''} tasks for ${targetDate}.

Requirements:
- Generate up to ${maxTasks} specific, actionable task suggestions
- Each task must include: title (specific, with account name and purpose), type (visit/call/meeting/email/other), accountName, scheduledDate (YYYY-MM-DD), notes (reasoning)
- Priority order: urgent opportunity follow-ups > long-overdue client revisits > high-value pipeline progression > routine maintenance
- Avoid conflicts with existing activities${focus ? `\n- Focus area: ${focus}` : ''}
- Return JSON array: [{"title":"...", "type":"...", "accountName":"...", "scheduledDate":"...", "notes":"..."}]
- Return ONLY JSON, no other text`;

        const dataPayload = `Pipeline (${activeOpps.length} active opportunities):
${JSON.stringify(activeOpps.map((o) => ({
  name: o.name1, account: o.account?.name1, amount: o.totalamount,
  stage: o.stage, confidence: o.confidence, closeDate: o.expectedclosedate,
  blocker: o.blocker, lastAction: o.lastaction,
})), null, 0).slice(0, 2000)}

Existing activities for ${targetDate}${period === 'week' ? ' week' : ''}:
${JSON.stringify(existingActivities.map((a) => ({
  title: a.title, type: a.type, account: a.account?.name1, date: a.scheduleddate,
})), null, 0).slice(0, 1000)}

Accounts needing contact (least recently contacted):
${JSON.stringify(accountsNeedingContact.map((a) => ({
  name: a.name1, lastContacted: a.lastcontactedon, tier: a.tier,
})), null, 0).slice(0, 800)}

Recent conversation:
${recentHistory.slice(0, 500)}`;

        const { invokeFlowForLLM } = await import('@/services/power-automate-service');
        const llmResp = await invokeFlowForLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: dataPayload },
          ],
          responseFormat: 'text',
        });

        if (!llmResp.success || !llmResp.content) {
          return { success: false, error: llmResp.error || 'LLM failed to generate plan' };
        }

        // Parse suggestions
        const jsonMatch = llmResp.content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          return { success: false, error: 'Failed to parse plan suggestions' };
        }

        const suggestions = JSON.parse(jsonMatch[0]) as Array<{
          title: string; type: string; accountName: string; scheduledDate: string; notes: string;
        }>;

        // Return as batch form card data (reuses existing multi-intent UI)
        return {
          success: true,
          data: {
            type: 'batch' as const,
            items: suggestions.slice(0, maxTasks).map((s, idx) => ({
              type: 'activity' as const,
              isNew: true,
              data: {
                title: s.title,
                type: s.type || 'visit',
                accountName: s.accountName || '',
                scheduledDate: s.scheduledDate || targetDate,
                notes: s.notes || '',
                temporalMode: 'planned',
              },
              batchIndex: idx,
              reason: s.notes || '',
            })),
          },
          message: isZh
            ? `基于您的 pipeline 和客户数据，为 ${targetDate} 规划了 ${Math.min(suggestions.length, maxTasks)} 个建议任务：`
            : `Based on your pipeline and client data, ${Math.min(suggestions.length, maxTasks)} tasks suggested for ${targetDate}:`,
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