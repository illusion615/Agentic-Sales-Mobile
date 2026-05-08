/**
 * Function Executor for Copilot Function Calling
 * Executes functions based on LLM-generated function calls
 */

import { initialize } from '@microsoft/power-apps/app';
import { AccountService } from '@/generated/services/account-service';
import { OpportunityService } from '@/generated/services/opportunity-service';
import { ActivityService } from '@/generated/services/activity-service';
import type { Account, AccountRegionkey, AccountTierkey } from '@/generated/models/account-model';
import type { Opportunity, OpportunityStagekey } from '@/generated/models/opportunity-model';
import type { Activity, ActivityTypekey } from '@/generated/models/activity-model';

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
}

// Region label to key mapping
const regionLabelToKey: Record<string, AccountRegionkey> = {
  '华东': 'Regionkey0',
  '华北': 'Regionkey1',
  '华南': 'Regionkey2',
  '西南': 'Regionkey3',
};

// Tier label to key mapping
const tierLabelToKey: Record<string, AccountTierkey> = {
  'S': 'Tierkey0',
  'A': 'Tierkey1',
  'B': 'Tierkey2',
  'C': 'Tierkey3',
};

// Stage label to key mapping
const stageLabelToKey: Record<string, OpportunityStagekey> = {
  'prospecting': 'Stagekey0',
  'qualification': 'Stagekey1',
  'proposal': 'Stagekey2',
  'negotiation': 'Stagekey3',
  'won': 'Stagekey4',
  'lost': 'Stagekey5',
};

// Activity type label to key mapping
const activityTypeLabelToKey: Record<string, ActivityTypekey> = {
  'visit': 'Typekey0',
  'call': 'Typekey1',
  'meeting': 'Typekey2',
  'email': 'Typekey3',
  'other': 'Typekey4',
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

      case 'createActivity': {
        const typeLabel = args.type as string;
        const title = args.title as string;
        const notes = args.notes as string | undefined;
        const scheduledDate = args.scheduledDate as string | undefined;
        const accountId = args.accountId as string | undefined;
        const accountName = args.accountName as string | undefined;

        if (!typeLabel || !title) {
          return { success: false, error: '缺少必需参数: type, title' };
        }

        const typeKey = activityTypeLabelToKey[typeLabel];
        if (!typeKey) {
          return { success: false, error: `未知活动类型: ${typeLabel}` };
        }

        // Find account by ID or name for lookup
        let accountLookup: { id: string; name1: string } | undefined;
        if (accountId) {
          const account = await AccountService.get(accountId);
          if (account) {
            accountLookup = { id: account.id, name1: account.name1 };
          }
        } else if (accountName) {
          const accounts = await AccountService.getAll();
          const found = accounts.find((a: Account) => a.name1?.toLowerCase().includes(accountName.toLowerCase()));
          if (found) {
            accountLookup = { id: found.id, name1: found.name1 };
          }
        }

        const newActivity = await ActivityService.create({
          title,
          typeKey,
          draftstatusKey: 'Draftstatuskey0', // draft
          ownerid: context.userId || 'unknown',
          scheduleddate: scheduledDate || new Date().toISOString(),
          notes: notes || '',
          ...(accountLookup && { account: accountLookup }),
        });

        return {
          success: true,
          data: {
            id: newActivity.id,
            title: newActivity.title,
            account: accountLookup?.name1,
            message: '活动创建成功',
          },
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
            accountName: args.accountName as string || '',
            contactName: args.contactName as string || '',
            scheduledDate: args.scheduledDate as string || new Date().toISOString().split('T')[0],
            result: args.result as string || '',
            nextStep: args.nextStep as string || '',
            notes: args.notes as string || '',
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
