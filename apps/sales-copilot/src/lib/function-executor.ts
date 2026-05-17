/**
 * Function Executor for Copilot Function Calling
 * Executes functions based on LLM-generated function calls
 */

import { initialize } from '@microsoft/power-apps/app';
import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import { ContactService } from '@/generated/services/contact-service';
import type { Account, AccountRegionKey, AccountTierKey } from '@/generated/models/account-model';
import type { Opportunity, OpportunityStageKey } from '@/generated/models/opportunity-model';
import type { Activity, ActivityTypeKey, ActivityDraftstatusKey } from '@/generated/models/activity-model';
import type { Contact } from '@/generated/models/contact-model';
import { calculateEnhancedMatchScore, getConfidenceLevel, type EnhancedMatchScore } from './agent-utils';

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

// Direct Line session refs types (imported from context)
export interface DirectLineTokenRef {
  token: string;
  expiresAt: number;
}

export interface DirectLineConversationRef {
  conversationId: string;
  streamUrl?: string;
  watermark?: string;
}

export interface DirectLineSessionRefs {
  tokenRef: React.MutableRefObject<DirectLineTokenRef | null>;
  conversationRef: React.MutableRefObject<DirectLineConversationRef | null>;
}

export interface FunctionCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  // Query keys to invalidate after mutation (for UI refresh)
  invalidateQueries?: string[];
}

// Region label to key mapping
const regionLabelToKey: Record<string, AccountRegionKey> = {
  '华东': 'RegionKey0',
  '华北': 'RegionKey1',
  '华南': 'RegionKey2',
  '西南': 'RegionKey3',
};

// Tier label to key mapping
const tierLabelToKey: Record<string, AccountTierKey> = {
  'S': 'TierKey0',
  'A': 'TierKey1',
  'B': 'TierKey2',
  'C': 'TierKey3',
};

// Stage label to key mapping
const stageLabelToKey: Record<string, OpportunityStageKey> = {
  'prospecting': 'StageKey0',
  'qualification': 'StageKey1',
  'proposal': 'StageKey2',
  'negotiation': 'StageKey3',
  'won': 'StageKey4',
  'lost': 'StageKey5',
};

// Activity type label to key mapping
const activityTypeLabelToKey: Record<string, ActivityTypeKey> = {
  'visit': 'TypeKey0',
  'call': 'TypeKey1',
  'meeting': 'TypeKey2',
  'email': 'TypeKey3',
  'other': 'TypeKey4',
};

// Activity status label to key mapping (supports various user expressions)
const activityStatusLabelToKey: Record<string, ActivityDraftstatusKey> = {
  // English
  'draft': 'DraftstatusKey0',
  'confirmed': 'DraftstatusKey1',
  'completed': 'DraftstatusKey2',
  'cancelled': 'DraftstatusKey3',
  'canceled': 'DraftstatusKey3',
  // Common variations
  'done': 'DraftstatusKey2',
  'complete': 'DraftstatusKey2',
  'finished': 'DraftstatusKey2',
  'cancel': 'DraftstatusKey3',
  'confirm': 'DraftstatusKey1',
  // Chinese
  '草稿': 'DraftstatusKey0',
  '已确认': 'DraftstatusKey1',
  '确认': 'DraftstatusKey1',
  '已完成': 'DraftstatusKey2',
  '完成': 'DraftstatusKey2',
  '已取消': 'DraftstatusKey3',
  '取消': 'DraftstatusKey3',
};

/**
 * Execute a function by name with given arguments
 */
export async function executeFunction(
  functionName: string,
  args: Record<string, unknown>,
  context: { userId?: string; userEmail?: string },
  sessionRefs?: DirectLineSessionRefs
): Promise<FunctionCallResult> {
  console.log('[FN] ENTER executeFunction, name=' + functionName + ', args=' + JSON.stringify(args));

  try {
    // Initialize Power Apps SDK before service calls
    await initialize();
    switch (functionName) {
      // ===== Account Functions =====
      case 'searchAccounts': {
        const query = (args.query as string || '').toLowerCase();
        const limit = (args.limit as number) || 5;
        const accounts = await AccountService.getAll();
        const filtered = accounts
          .filter((a: Account) => a.name1?.toLowerCase().includes(query))
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((a: Account) => ({
            id: a.id,
            name: a.name1,
            industry: a.industry,
            region: a.regionKey,
            tier: a.tierKey,
            phone: a.phone,
            email: a.email,
          })),
        };
      }

      case 'getAccountDetails': {
        const accountId = args.accountId as string;
        if (!accountId) return { success: false, error: '缺少 accountId 参数' };
        const account = await AccountService.get(accountId);
        return { success: true, data: account };
      }

      case 'getAccountsByRegion': {
        const regionLabel = args.region as string;
        const regionKey = regionLabelToKey[regionLabel];
        const limit = (args.limit as number) || 10;
        if (!regionKey) return { success: false, error: `未知区域: ${regionLabel}` };
        const accounts = await AccountService.getAll();
        const filtered = accounts
          .filter((a: Account) => a.regionKey === regionKey)
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((a: Account) => ({
            id: a.id,
            name: a.name1,
            industry: a.industry,
            tier: a.tierKey,
          })),
        };
      }

      case 'getAccountsByTier': {
        const tierLabel = args.tier as string;
        const tierKey = tierLabelToKey[tierLabel];
        const limit = (args.limit as number) || 10;
        if (!tierKey) return { success: false, error: `未知等级: ${tierLabel}` };
        const accounts = await AccountService.getAll();
        const filtered = accounts
          .filter((a: Account) => a.tierKey === tierKey)
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((a: Account) => ({
            id: a.id,
            name: a.name1,
            industry: a.industry,
            region: a.regionKey,
          })),
        };
      }

      // ===== Opportunity Functions =====
      case 'getMyOpportunities': {
        const stageLabel = args.stage as string | undefined;
        const limit = (args.limit as number) || 10;
        const opportunities = await OpportunityService.getAll();
        let filtered = opportunities;
        if (stageLabel && stageLabelToKey[stageLabel]) {
          const stageKey = stageLabelToKey[stageLabel];
          filtered = opportunities.filter((o: Opportunity) => o.stageKey === stageKey);
        }
        // Filter by owner if userId provided
        if (context.userId) {
          filtered = filtered.filter((o: Opportunity) => o.ownerid === context.userId);
        }
        return {
          success: true,
          data: filtered.slice(0, limit).map((o: Opportunity) => ({
            id: o.id,
            name: o.name1,
            account: o.account?.name1,
            amount: o.totalamount,
            stage: o.stageKey,
            confidence: o.confidence,
            expectedCloseDate: o.expectedclosedate,
          })),
        };
      }

      case 'getTopOpportunities': {
        const limit = (args.limit as number) || 5;
        const opportunities = await OpportunityService.getAll();
        const sorted = [...opportunities].sort((a: Opportunity, b: Opportunity) => b.totalamount - a.totalamount);
        return {
          success: true,
          data: sorted.slice(0, limit).map((o: Opportunity) => ({
            id: o.id,
            name: o.name1,
            account: o.account?.name1,
            amount: o.totalamount,
            stage: o.stageKey,
            confidence: o.confidence,
          })),
        };
      }

      case 'getOpportunitiesByAccount': {
        const accountId = args.accountId as string;
        if (!accountId) return { success: false, error: '缺少 accountId 参数' };
        const opportunities = await OpportunityService.getAll();
        const filtered = opportunities.filter((o: Opportunity) => o.account?.id === accountId);
        return {
          success: true,
          data: filtered.map((o: Opportunity) => ({
            id: o.id,
            name: o.name1,
            amount: o.totalamount,
            stage: o.stageKey,
            confidence: o.confidence,
            expectedCloseDate: o.expectedclosedate,
          })),
        };
      }

      case 'getOpportunitiesClosingSoon': {
        const days = (args.days as number) || 7;
        const limit = (args.limit as number) || 10;
        const opportunities = await OpportunityService.getAll();
        const now = new Date();
        const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const filtered = opportunities
          .filter((o: Opportunity) => {
            if (!o.expectedclosedate) return false;
            const closeDate = new Date(o.expectedclosedate);
            return closeDate >= now && closeDate <= cutoff;
          })
          .sort((a: Opportunity, b: Opportunity) => {
            const dateA = new Date(a.expectedclosedate || 0);
            const dateB = new Date(b.expectedclosedate || 0);
            return dateA.getTime() - dateB.getTime();
          })
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((o: Opportunity) => ({
            id: o.id,
            name: o.name1,
            account: o.account?.name1,
            amount: o.totalamount,
            stage: o.stageKey,
            expectedCloseDate: o.expectedclosedate,
          })),
        };
      }

      // ===== Activity Functions =====
      case 'getTodayActivities': {
        const typeLabel = args.type as string | undefined;
        const activities = await ActivityService.getAll();
        const today = new Date().toISOString().split('T')[0];
        let filtered = activities.filter((a: Activity) => a.scheduleddate?.startsWith(today));
        if (typeLabel && activityTypeLabelToKey[typeLabel]) {
          const typeKey = activityTypeLabelToKey[typeLabel];
          filtered = filtered.filter((a: Activity) => a.typeKey === typeKey);
        }
        return {
          success: true,
          data: filtered.map((a: Activity) => ({
            id: a.id,
            title: a.title,
            type: a.typeKey,
            account: a.account?.name1,
            scheduledDate: a.scheduleddate,
            status: a.draftstatusKey,
            notes: a.notes,
          })),
        };
      }

      case 'getUpcomingActivities': {
        const days = (args.days as number) || 7;
        const limit = (args.limit as number) || 10;
        const activities = await ActivityService.getAll();
        const now = new Date();
        const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const filtered = activities
          .filter((a: Activity) => {
            if (!a.scheduleddate) return false;
            const schedDate = new Date(a.scheduleddate);
            return schedDate >= now && schedDate <= cutoff;
          })
          .sort((a: Activity, b: Activity) => {
            const dateA = new Date(a.scheduleddate || 0);
            const dateB = new Date(b.scheduleddate || 0);
            return dateA.getTime() - dateB.getTime();
          })
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((a: Activity) => ({
            id: a.id,
            title: a.title,
            type: a.typeKey,
            account: a.account?.name1,
            scheduledDate: a.scheduleddate,
            status: a.draftstatusKey,
          })),
        };
      }

      case 'getActivitiesByAccount': {
        const accountId = args.accountId as string;
        const limit = (args.limit as number) || 10;
        if (!accountId) return { success: false, error: '缺少 accountId 参数' };
        const activities = await ActivityService.getAll();
        const filtered = activities
          .filter((a: Activity) => a.account?.id === accountId)
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((a: Activity) => ({
            id: a.id,
            title: a.title,
            type: a.typeKey,
            scheduledDate: a.scheduleddate,
            status: a.draftstatusKey,
            notes: a.notes,
          })),
        };
      }

      case 'getContactsByAccount': {
        const accountId = args.accountId as string;
        const limit = (args.limit as number) || 10;
        if (!accountId) return { success: false, error: '缺少 accountId 参数' };
        const contacts = await ContactService.getAll();
        const filtered = contacts
          .filter((c: Contact) => c.account?.id === accountId)
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((c: Contact) => ({
            id: c.id,
            name: c.fullname,
            title: c.title,
            phone: c.phone,
            email: c.email,
            accountName: c.account?.name1,
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
            nextStep: args.nextStep as string || '',
            opportunityId: args.opportunityId as string || '',
            opportunityName: args.opportunityName as string || '',
            notes: args.notes as string || '',
            // I-8 Slice A: carry temporal tense from LLM into form state so
            // ActivityFormCard can show/hide result/nextStep and derive draftstatusKey.
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
        if (args.region && regionLabelToKey[args.region as string]) {
          accountChanges.regionKey = regionLabelToKey[args.region as string];
        }
        if (args.tier && tierLabelToKey[args.tier as string]) {
          accountChanges.tierKey = tierLabelToKey[args.tier as string];
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
        if (args.stage && stageLabelToKey[args.stage as string]) {
          oppChanges.stageKey = stageLabelToKey[args.stage as string];
        }
        if (args.confidence !== undefined) oppChanges.confidence = args.confidence as number;
        if (args.expectedCloseDate) oppChanges.expectedclosedate = args.expectedCloseDate as string;
        if (args.lastAction) oppChanges.lastaction = args.lastAction as string;
        
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
        if (args.type && activityTypeLabelToKey[args.type as string]) {
          actChanges.typeKey = activityTypeLabelToKey[args.type as string];
        }
        // Handle status update - map user-friendly terms to draftstatusKey
        if (args.status) {
          const statusStr = (args.status as string).toLowerCase();
          if (activityStatusLabelToKey[statusStr]) {
            actChanges.draftstatusKey = activityStatusLabelToKey[statusStr];
          }
        }
        if (args.scheduledDate) actChanges.scheduleddate = args.scheduledDate as string;
        if (args.notes) actChanges.notes = args.notes as string;
        // result and nextStep might be stored in notes or outcome
        if (args.result) {
          actChanges.notes = (actChanges.notes || '') + ' | 结果: ' + (args.result as string);
        }
        if (args.nextStep) {
          actChanges.notes = (actChanges.notes || '') + ' | 下一步: ' + (args.nextStep as string);
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
        
        return {
          success: true,
          data: {
            message: `活动记录已更新 / Activity updated successfully`,
            activity: updatedActivity,
            updatedFields: Object.keys(actChanges),
          },
          invalidateQueries: ['activity-list'],
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

      // ===== Summary/Analytics Functions =====
      case 'getSalesSummary': {
        const opportunities = await OpportunityService.getAll();
        const totalAmount = opportunities.reduce((sum: number, o: Opportunity) => sum + o.totalamount, 0);
        const byStage: Record<string, { count: number; amount: number }> = {};
        opportunities.forEach((o: Opportunity) => {
          const stage = o.stageKey || 'unknown';
          if (!byStage[stage]) byStage[stage] = { count: 0, amount: 0 };
          byStage[stage].count++;
          byStage[stage].amount += o.totalamount;
        });
        return {
          success: true,
          data: {
            totalOpportunities: opportunities.length,
            totalAmount,
            averageAmount: opportunities.length > 0 ? totalAmount / opportunities.length : 0,
            byStage,
          },
        };
      }

      case 'getAccountsNeedingFollowUp': {
        const daysSinceLastContact = (args.daysSinceLastContact as number) || 7;
        const limit = (args.limit as number) || 10;
        const accounts = await AccountService.getAll();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastContact);
        const filtered = accounts
          .filter((a: Account) => {
            if (!a.lastcontactedon) return true; // Never contacted
            const lastContact = new Date(a.lastcontactedon);
            return lastContact < cutoffDate;
          })
          .slice(0, limit);
        return {
          success: true,
          data: filtered.map((a: Account) => ({
            id: a.id,
            name: a.name1,
            lastContactedOn: a.lastcontactedon,
            tier: a.tierKey,
            phone: a.phone,
          })),
        };
      }

      // ===== Copilot Studio Tool =====
      case 'queryCopilotStudio': {
        const query = args.query as string;
        console.log('[CS] ENTER queryCopilotStudio, query=' + query);
        if (!query) return { success: false, error: '缺少 query 参数' };
        
        // Get Copilot Studio endpoint from settings (uses 'copilot-studio-config' key)
        const settingsRaw = localStorage.getItem('copilot-studio-config');
        console.log('[CS] settings raw from localStorage:', settingsRaw);
        const parsedSettings = settingsRaw ? JSON.parse(settingsRaw) : {};
        const tokenEndpoint = parsedSettings.endpoint;
        console.log('[CS] parsedSettings.enabled=' + parsedSettings.enabled + ', tokenEndpoint=' + tokenEndpoint);
        
        // Check if Copilot Studio is enabled AND endpoint is configured
        if (!parsedSettings.enabled || !tokenEndpoint) {
          console.log('[CS] NOT CONFIGURED - returning error');
          return { 
            success: false, 
            error: 'Copilot Studio 未配置或未启用。请在设置中配置 Token Endpoint 并启用。' 
          };
        }
        
        // Helper function to attempt query with session reuse
        const attemptQuery = async (isRetry: boolean = false): Promise<FunctionCallResult> => {
          try {
            const tokenRef = sessionRefs?.tokenRef;
            const conversationRef = sessionRefs?.conversationRef;
            
            // === TOKEN MANAGEMENT ===
            let token: string;
            const now = Date.now();
            const TOKEN_SAFETY_MARGIN_MS = 60000; // 60 seconds before expiry
            
            if (tokenRef?.current && tokenRef.current.expiresAt - now > TOKEN_SAFETY_MARGIN_MS) {
              // Reuse existing token
              token = tokenRef.current.token;
              console.log('[CS] Reusing existing token, expires in:', Math.round((tokenRef.current.expiresAt - now) / 1000), 'seconds');
            } else {
              // Fetch new token
              console.log('[CS] Fetching new token from:', tokenEndpoint);
              const tokenResponse = await fetch(tokenEndpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              });
              console.log('[CS] token response status:', tokenResponse.status);
              
              if (!tokenResponse.ok) {
                return { success: false, error: `获取 Copilot Studio token 失败: ${tokenResponse.status}` };
              }
              
              const tokenData = await tokenResponse.json();
              token = tokenData.token;
              console.log('[CS] token obtained, length:', token?.length || 0);
              
              if (!token) {
                return { success: false, error: '无法获取 Copilot Studio 访问令牌' };
              }
              
              // Store token with expiry (Direct Line tokens typically last 30 minutes)
              // We'll use expires_in from response or default to 30 minutes
              const expiresIn = tokenData.expires_in || 1800; // seconds
              if (tokenRef) {
                tokenRef.current = {
                  token,
                  expiresAt: now + (expiresIn * 1000),
                };
              }
            }
            
            // === CONVERSATION MANAGEMENT ===
            let conversationId: string;
            let initialWatermark: string | undefined;
            
            if (conversationRef?.current && !isRetry) {
              // Reuse existing conversation
              conversationId = conversationRef.current.conversationId;
              initialWatermark = conversationRef.current.watermark;
              console.log('[CS] Reusing existing conversation:', conversationId, 'watermark:', initialWatermark || '(none)');
            } else {
              // Create new conversation
              if (isRetry && conversationRef) {
                console.log('[CS] Retry: clearing old conversation ref');
                conversationRef.current = null;
              }
              
              console.log('[CS] Creating new Direct Line conversation...');
              const conversationResponse = await fetch('https://directline.botframework.com/v3/directline/conversations', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });
              console.log('[CS] conversation response status:', conversationResponse.status);
              
              if (!conversationResponse.ok) {
                // If 401/403, clear token and fail
                if (conversationResponse.status === 401 || conversationResponse.status === 403) {
                  if (tokenRef) tokenRef.current = null;
                }
                return { success: false, error: `创建 Direct Line 会话失败: ${conversationResponse.status}` };
              }
              
              const conversationData = await conversationResponse.json();
              conversationId = conversationData.conversationId;
              initialWatermark = undefined;
              
              // Store conversation ref
              if (conversationRef) {
                conversationRef.current = {
                  conversationId,
                  streamUrl: conversationData.streamUrl,
                  watermark: undefined,
                };
              }
              console.log('[CS] New conversationId:', conversationId);
            }
            
            // === SEND MESSAGE ===
            const senderId = 'sales-copilot-user';
            console.log('[CS] Sending message to bot, senderId:', senderId, ', text:', query);
            const sendResponse = await fetch(
              `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  type: 'message',
                  text: query,
                }),
              }
            );
            console.log('[CS] send message response status:', sendResponse.status);
            
            if (!sendResponse.ok) {
              // If 401/403/404, conversation might be expired - clear refs and retry once
              if (!isRetry && (sendResponse.status === 401 || sendResponse.status === 403 || sendResponse.status === 404)) {
                console.log('[CS] Send failed with', sendResponse.status, '- clearing refs and retrying');
                if (conversationRef) conversationRef.current = null;
                if (sendResponse.status === 401 || sendResponse.status === 403) {
                  if (tokenRef) tokenRef.current = null;
                }
                return attemptQuery(true);
              }
              return { success: false, error: `发送消息到 Copilot Studio 失败: ${sendResponse.status}` };
            }
            
            // === POLL FOR RESPONSE ===
            const MAX_MS = 20000;
            const INTERVAL_MS = 800;
            const QUIET_MS = 2500;
            
            console.log('[CS] Starting polling, MAX_MS=' + MAX_MS + ', INTERVAL=' + INTERVAL_MS + ', QUIET_MS=' + QUIET_MS);
            
            interface DirectLineActivity {
              id?: string;
              type: string;
              from?: { id?: string; role?: string };
              text?: string;
              timestamp?: string;
            }
            
            let watermark: string | undefined = initialWatermark;
            const collected: DirectLineActivity[] = [];
            let lastActivityAt = Date.now();
            const startTime = Date.now();
            
            // Helper to check if activity is from bot (strict role check)
            const isBot = (a: DirectLineActivity): boolean => {
              return (
                a.type === 'message' &&
                !!a.from &&
                a.from.role === 'bot' &&
                typeof a.text === 'string' &&
                a.text.length > 0
              );
            };
            
            while (Date.now() - startTime < MAX_MS) {
              await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
              
              // Build URL with watermark if available
              let url = `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`;
              if (watermark) {
                url += `?watermark=${encodeURIComponent(watermark)}`;
              }
              console.log('[CS] watermark:', watermark || '(none)');
              
              const activitiesResponse = await fetch(url, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });
              
              if (!activitiesResponse.ok) {
                console.log('[CS] Poll failed with status:', activitiesResponse.status);
                // If 401/403/404 on poll, conversation might be expired
                if (!isRetry && (activitiesResponse.status === 401 || activitiesResponse.status === 403 || activitiesResponse.status === 404)) {
                  console.log('[CS] Poll failed with', activitiesResponse.status, '- clearing refs and retrying');
                  if (conversationRef) conversationRef.current = null;
                  if (activitiesResponse.status === 401 || activitiesResponse.status === 403) {
                    if (tokenRef) tokenRef.current = null;
                  }
                  return attemptQuery(true);
                }
                continue;
              }
              
              const activitiesData = await activitiesResponse.json();
              const activities: DirectLineActivity[] = activitiesData.activities || [];
              
              // Update watermark for next poll AND store in ref
              if (activitiesData.watermark) {
                watermark = activitiesData.watermark;
                if (conversationRef?.current) {
                  conversationRef.current.watermark = watermark;
                }
              }
              
              // Log all activity from.ids
              console.log('[CS] all activity from.ids:', activities.map((a: DirectLineActivity) => a.from?.id).join(', ') || '(empty)');
              
              // Check for typing activity from bot (update lastActivityAt)
              const hasTyping = activities.some((a: DirectLineActivity) => 
                a.type === 'typing' && a.from?.role === 'bot'
              );
              if (hasTyping) {
                lastActivityAt = Date.now();
                console.log('[CS] bot typing detected, reset lastActivityAt');
              }
              
              // Filter for new bot messages
              const newBotMessages = activities.filter(isBot);
              
              if (newBotMessages.length > 0) {
                for (const m of newBotMessages) {
                  console.log('[CS] msg from.role:', m.from?.role, 'from.id:', m.from?.id);
                }
                console.log('[CS] new bot messages this poll:', newBotMessages.map((m: DirectLineActivity) => ({
                  id: m.id,
                  text: (m.text || '').slice(0, 80),
                  timestamp: m.timestamp,
                })));
                
                // Add to collected (avoid duplicates by id)
                const existingIds = new Set(collected.map((c: DirectLineActivity) => c.id));
                for (const msg of newBotMessages) {
                  if (!existingIds.has(msg.id)) {
                    collected.push(msg);
                    lastActivityAt = Date.now();
                  }
                }
                console.log('[CS] collected total:', collected.length);
              }
              
              // Check if we should break: have messages AND quiet period elapsed
              const quietElapsed = Date.now() - lastActivityAt;
              if (collected.length > 0 && quietElapsed > QUIET_MS) {
                console.log('[CS] Quiet period elapsed (' + quietElapsed + 'ms > ' + QUIET_MS + 'ms), breaking');
                break;
              }
            }
            
            // Combine collected messages
            if (collected.length > 0) {
              const combined = collected
                .sort((a: DirectLineActivity, b: DirectLineActivity) => 
                  new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
                )
                .map((m: DirectLineActivity) => m.text)
                .join('\n\n');
              
              console.log('[CS] FINAL combined (' + collected.length + ' messages):', combined.slice(0, 200));
              
              return {
                success: true,
                data: {
                  answer: combined || '(no reply)',
                  source: 'Copilot Studio',
                  conversationId,
                },
              };
            }
            
            console.log('[CS] No bot messages collected after timeout');
            return { success: false, error: 'Copilot Studio 响应超时' };
          } catch (fetchError: unknown) {
            console.error('[CS] Copilot Studio error:', fetchError);
            // On error, clear refs if this might be a session issue
            const errorMsg = fetchError instanceof Error ? fetchError.message : '';
            if (errorMsg.includes('expired') || errorMsg.includes('not found') || errorMsg.includes('Conversation')) {
              if (sessionRefs?.conversationRef) sessionRefs.conversationRef.current = null;
            }
            return { 
              success: false, 
              error: fetchError instanceof Error ? fetchError.message : 'Copilot Studio 请求失败' 
            };
          }
        };
        
        // Execute the query with session reuse
        return attemptQuery();
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
              region: a.regionKey,
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
              stage: o.stageKey,
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
          title: string;
          typeKey?: string;
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
          
          // Exact title match: high score
          if (titleLower === queryLower) {
            score = 100;
          } else if (titleLower.includes(queryLower)) {
            score = 80;
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
          
          return {
            id: activity.id,
            title: activity.title,
            typeKey: activity.typeKey,
            scheduleddate: activity.scheduleddate,
            accountId: activity.account?.id,
            accountName: activity.account?.name1 || '未关联客户',
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
        
        // Process each item and return batch form card data
        const formCards = items.map((item: { type: string; data: Record<string, unknown> }, index: number) => {
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
          }
          console.log('[batchDraft] item', index, 'type:', itemType, 'accountId:', itemData.accountId, 'accountName:', itemData.accountName);
          
          return {
            type: itemType as 'activity' | 'opportunity' | 'account' | 'contact',
            isNew: true,
            data: itemData,
            batchIndex: index,
          };
        });
        
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