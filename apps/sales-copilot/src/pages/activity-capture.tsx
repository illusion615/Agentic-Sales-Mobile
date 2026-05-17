import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  MoreHorizontal,
  Loader2,
  WifiOff,
  Check,
  Calendar,
  User,
  Building2,
  FileText,
  Target,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useAccountList } from '@/generated/hooks/use-account';
import { useCreateActivity, useActivity, useUpdateActivity } from '@/generated/hooks/use-activity';
import { useOpportunityList, useCreateOpportunity, useUpdateOpportunity } from '@/generated/hooks/use-opportunity';
import { useContactList } from '@/generated/hooks/use-contact';
import { useWithAISummaryTrigger } from '@/hooks/use-ai-summary-trigger';
import { touchAccountLastContacted } from '@/lib/account-touch';
import { getLocale, t, type Locale, getLLMConfig, getAgentFramework } from '@/lib/i18n';
import { invokeFlowForLLM } from '@/services/power-automate-service';
import { getCopilotConfig } from '@/services/copilot-service';
import { useCopilot } from '@/contexts/copilot-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Check if AI assistant is configured based on selected agent framework
function isAIAssistantConfigured(): boolean {
  try {
    const agentFramework = getAgentFramework();
    
    if (agentFramework === 'local-agent') {
      // Check BYOM configuration
      const llmConfig = getLLMConfig();
      return !!llmConfig?.enabled && !!llmConfig?.endpoint;
    } else {
      // Check Copilot Studio configuration
      const copilotConfig = getCopilotConfig();
      return !!copilotConfig?.tokenEndpoint;
    }
  } catch {
    return false;
  }
}

export default function ActivityCapturePage() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const editActivityId = searchParams.get('edit');
  const isEditMode = !!editActivityId;
  
  // Get draft data from navigation state (from FormCard modify button)
  // Use useRef to capture the initial draft data on mount - this prevents losing data
  // when React Query causes re-renders as data loads
  const draftDataRef = useRef<Record<string, unknown> | undefined>(
    (location.state as { draftData?: Record<string, unknown> })?.draftData
  );
  const draftData = draftDataRef.current;
  
  // Debug: Log draft data on mount
  useEffect(() => {
    console.log('[ActivityCapture] Mounted with draftData:', draftData);
  }, []);
  const { data: user } = useUser();
  const locale: Locale = getLocale();
  const copilotEnabled = isAIAssistantConfigured();
  const copilot = useCopilot();

  // Data - use useActivity(id) for single record lookup instead of useActivityList().find()
  const { data: accounts = [] } = useAccountList();
  const {
    data: existingActivity,
    isLoading: isLoadingActivity,
    error: activityError,
  } = useActivity(editActivityId || '');
  const { data: opportunities = [], refetch: refetchOpportunities } = useOpportunityList();
  const { data: contacts = [] } = useContactList();
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const createOpportunity = useCreateOpportunity();
  const updateOpportunity = useUpdateOpportunity();
  const { triggerForEntity } = useWithAISummaryTrigger();

  // Find account by param
  const account = accounts.find((a) => a.id === accountId);

  // The canonical activity ID - always use this, never the URL param directly
  const activityId = existingActivity?.id;

  // State
  const [isOffline] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAIFilled, setIsAIFilled] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    accountId: accountId || '',
    accountName: account?.name1 || '',
    contactId: '',
    contactName: '',
    opportunityId: '',
    opportunityName: '',
    visitDate: new Date().toISOString().split('T')[0],
    visitType: 'client-visit',
    result: '',
    nextStep: '',
    opportunityIntent: '',
  });

  // Parse contact and nextStep from notes (stored as structured text)
  const parseNotesData = (notes: string | undefined): { result: string; contactName: string; nextStep: string; opportunityIntent: string } => {
    if (!notes) return { result: '', contactName: '', nextStep: '', opportunityIntent: '' };
    
    const contactMatch = notes.match(/Contact:\s*(.+?)(?:\n|$)/);
    const nextStepMatch = notes.match(/Next Step:\s*(.+?)(?:\n|$)/);
    const opportunityMatch = notes.match(/Opportunity:\s*(.+?)(?:\n|$)/);
    
    // Extract the main result (before the metadata section)
    const resultEnd = notes.indexOf('\n\nContact:');
    const result = resultEnd > 0 ? notes.substring(0, resultEnd) : notes;
    
    return {
      result: result.trim(),
      contactName: contactMatch?.[1]?.trim() || '',
      nextStep: nextStepMatch?.[1]?.trim() || '',
      opportunityIntent: opportunityMatch?.[1]?.trim() || '',
    };
  };

  // Load existing activity data when in edit mode or from draft data
  useEffect(() => {
    // Priority 1: Draft data from Copilot FormCard (modify button)
    if (draftData) {
      setFormData({
        title: (draftData.title as string) || '',
        accountId: (draftData.accountId as string) || accountId || '',
        accountName: (draftData.accountName as string) || account?.name1 || '',
        contactId: (draftData.contactId as string) || '',
        contactName: (draftData.contactName as string) || '',
        opportunityId: (draftData.opportunityId as string) || '',
        opportunityName: (draftData.opportunityName as string) || '',
        visitDate: (draftData.scheduledDate as string)?.split('T')[0] || new Date().toISOString().split('T')[0],
        visitType: (draftData.type as string) || 'client-visit',
        result: (draftData.result as string) || '',
        nextStep: (draftData.nextStep as string) || '',
        opportunityIntent: (draftData.opportunityIntent as string) || '',
      });
      setIsAIFilled(true); // Mark as AI-filled since it came from Copilot
      return;
    }
    
    // Priority 2: Edit mode - load existing activity
    if (isEditMode && existingActivity) {
      const parsedNotes = parseNotesData(existingActivity.notes);
      setFormData({
        title: existingActivity.title || '',
        accountId: existingActivity.account?.id || accountId || '',
        accountName: existingActivity.account?.name1 || account?.name1 || '',
        contactId: existingActivity.contact?.id || '',
        contactName: existingActivity.contact?.fullname || parsedNotes.contactName,
        opportunityId: existingActivity.opportunity?.id || '',
        opportunityName: existingActivity.opportunity?.name1 || '',
        visitDate: existingActivity.scheduleddate ? existingActivity.scheduleddate.split('T')[0] : new Date().toISOString().split('T')[0],
        visitType: 'client-visit',
        result: parsedNotes.result,
        nextStep: parsedNotes.nextStep,
        opportunityIntent: parsedNotes.opportunityIntent || existingActivity.opportunity?.name1 || '',
      });
    } else if (account?.name1 && accountId) {
      // Priority 3: Account from URL param
      setFormData((prev) => ({ ...prev, accountId, accountName: account.name1 }));
    }
  }, [draftData, isEditMode, existingActivity, account, accountId]);

  // Filter contacts based on selected account
  const filteredContacts = useMemo(() => {
    if (!formData.accountId) return contacts;
    return contacts.filter((c) => c.account?.id === formData.accountId);
  }, [contacts, formData.accountId]);

  // Filter opportunities based on selected account
  const filteredOpportunities = useMemo(() => {
    if (!formData.accountId) return opportunities;
    return opportunities.filter((o) => o.account?.id === formData.accountId);
  }, [opportunities, formData.accountId]);

  // Set copilot input placeholder and register form fill callback
  useEffect(() => {
    // Set custom placeholder for this page
    copilot.setInputPlaceholder(
      locale === 'zh-Hans' 
        ? '描述您的拜访内容...' 
        : 'Describe your visit...'
    );

    // Set page context
    copilot.setPageContext({
      currentPage: 'Activity Capture / New Visit',
      summary: locale === 'zh-Hans'
        ? `正在为客户 ${account?.name1 || '未选择'} 创建拜访记录。用户可以用自然语言描述拜访内容，然后由 AI 提取信息填充表单。`
        : `Creating visit record for account ${account?.name1 || 'not selected'}. User can describe the visit in natural language, and AI will extract info to fill the form.`,
      pageData: {
        accountId,
        accountName: account?.name1,
        formFields: ['title', 'accountName', 'contactName', 'visitDate', 'result', 'nextStep', 'opportunityIntent'],
      },
    });

    // Cleanup on unmount
    return () => {
      copilot.setInputPlaceholder('');
      copilot.setPageContext(null);
      copilot.setFormFillCallback(null);
    };
  }, [copilot.setInputPlaceholder, copilot.setPageContext, copilot.setFormFillCallback, locale, account?.name1, accountId]);

  // Form fill callback - called when agent extracts activity data
  const handleFormFill = useCallback((data: Record<string, unknown>) => {
    console.log('[ActivityCapture] Form fill received:', data);
    setFormData((prev) => ({
      ...prev,
      title: (data.title as string) || prev.title,
      accountName: (data.accountName as string) || prev.accountName,
      contactName: (data.contactName as string) || prev.contactName,
      visitDate: (data.visitDate as string) || prev.visitDate,
      result: (data.result as string) || prev.result,
      nextStep: (data.nextStep as string) || prev.nextStep,
      opportunityIntent: (data.opportunityIntent as string) || prev.opportunityIntent,
    }));
    setIsAIFilled(true);
    toast.success(
      locale === 'zh-Hans' 
        ? 'AI 已填充表单，请检查并确认' 
        : 'AI filled the form, please review and confirm'
    );
  }, [locale]);

  // Register the form fill callback
  useEffect(() => {
    copilot.setFormFillCallback(handleFormFill);
  }, [copilot.setFormFillCallback, handleFormFill]);

  // Analyze opportunity from activity data using AI
  const analyzeOpportunity = async (activityData: typeof formData): Promise<{
    hasOpportunity: boolean;
    opportunityName?: string;
    totalAmount?: number;
    stage?: string;
    confidence?: number;
    expectedCloseDate?: string;
    matchingOpportunityId?: string;
  } | null> => {
    const llmConfig = getLLMConfig();
    if (!llmConfig?.enabled || !llmConfig?.endpoint) {
      return null;
    }

    try {
      // Build context about existing opportunities for deduplication
      const existingOppsContext = opportunities
        .filter((opp) => opp.account?.id === accountId || opp.account?.name1 === activityData.accountName)
        .map((opp) => ({
          id: opp.id,
          name: opp.name1,
          amount: opp.totalamount,
          stage: opp.stageKey,
        }));

      const systemPrompt = locale === 'zh-Hans'
        ? `你是销售助手，分析拜访记录判断是否存在潜在商机。
严格输出 JSON，不要任何解释、markdown、代码块标记。
JSON schema: {
  "hasOpportunity": boolean,
  "opportunityName": string (商机名称，如果有),
  "totalAmount": number (预估金额，如果能推断),
  "stage": "prospecting" | "qualification" | "proposal" | "negotiation" | "won" | "lost" (销售阶段),
  "confidence": number (0-100 成交信心),
  "expectedCloseDate": string (预计成交日期 YYYY-MM-DD，如果能推断),
  "matchingOpportunityId": string (如果与现有商机重复，填入现有商机ID)
}

现有商机列表（用于去重）：
${JSON.stringify(existingOppsContext)}

判断规则：
- 如果拜访记录中提到具体项目、预算、采购意向、签约等，视为有潜在商机
- 如果商机名称/内容与现有商机高度相似，返回 matchingOpportunityId
- 如果只是普通拜访、维护关系、没有明确商业机会，hasOpportunity 为 false`
        : `You are a sales assistant analyzing visit records to identify potential opportunities.
Output strictly in JSON, no explanations, markdown, or code blocks.
JSON schema: {
  "hasOpportunity": boolean,
  "opportunityName": string (opportunity name if exists),
  "totalAmount": number (estimated amount if inferrable),
  "stage": "prospecting" | "qualification" | "proposal" | "negotiation" | "won" | "lost",
  "confidence": number (0-100 win confidence),
  "expectedCloseDate": string (expected close date YYYY-MM-DD if inferrable),
  "matchingOpportunityId": string (if duplicate with existing opportunity, fill in existing ID)
}

Existing opportunities (for deduplication):
${JSON.stringify(existingOppsContext)}

Rules:
- If visit mentions specific project, budget, purchase intent, contract, consider it a potential opportunity
- If opportunity name/content is highly similar to existing, return matchingOpportunityId
- If just regular visit, relationship maintenance, no clear business opportunity, hasOpportunity is false`;

      const userMessage = locale === 'zh-Hans'
        ? `拜访记录：
客户：${activityData.accountName}
联系人：${activityData.contactName}
拜访结果：${activityData.result}
下一步：${activityData.nextStep}
商机意向：${activityData.opportunityIntent}`
        : `Visit record:
Account: ${activityData.accountName}
Contact: ${activityData.contactName}
Result: ${activityData.result}
Next step: ${activityData.nextStep}
Opportunity intent: ${activityData.opportunityIntent}`;

      const response = await invokeFlowForLLM(llmConfig.endpoint, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],

        model: llmConfig.model,
        deploymentName: llmConfig.deploymentName,
      });

      if (!response.success || !response.content) {
        console.error('[ActivityCapture] AI analysis failed:', response.error);
        return null;
      }

      // Parse response
      let parsed;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return null;
        }
      }

      return parsed;
    } catch (error) {
      console.error('[ActivityCapture] AI opportunity analysis error:', error);
      return null;
    }
  };

  // Submit form (create or update)
  const handleSubmit = async () => {
    if (!formData.result.trim()) {
      toast.error(locale === 'zh-Hans' ? '请填写拜访结果' : 'Please enter visit result');
      return;
    }

    // In edit mode, ensure activity exists
    if (isEditMode && !activityId) {
      toast.error(locale === 'zh-Hans' ? '活动记录未找到' : 'Activity record not found');
      return;
    }

    setIsProcessing(true);

    try {
      const title = formData.title || `${t('newVisitTitle', locale)} - ${formData.accountName || account?.name1 || 'Unknown'}`;
      const notes = `${formData.result}\n\nContact: ${formData.contactName}\nNext Step: ${formData.nextStep}\nOpportunity: ${formData.opportunityIntent}`;
      
      // Determine account and opportunity to save
      const targetAccount = formData.accountId
        ? accounts.find((a) => a.id === formData.accountId)
        : accounts.find((a) => a.id === accountId);
      
      const targetOpportunity = formData.opportunityId
        ? opportunities.find((o) => o.id === formData.opportunityId)
        : null;
      
      // Find selected contact for lookup
      const targetContact = formData.contactId
        ? contacts.find((c) => c.id === formData.contactId)
        : null;
      
      // Save activity
      if (isEditMode && activityId) {
        // Update existing activity - include account, contact, and opportunity
        await updateActivity.mutateAsync({
          id: activityId,
          changedFields: {
            title,
            scheduleddate: new Date(formData.visitDate).toISOString(),
            notes,
            // Update account lookup
            ...(targetAccount ? { account: { id: targetAccount.id, name1: targetAccount.name1 } } : { account: undefined }),
            // Update contact lookup
            ...(targetContact ? { contact: { id: targetContact.id, fullname: targetContact.fullname } } : { contact: undefined }),
            // Update opportunity lookup
            ...(targetOpportunity ? { opportunity: { id: targetOpportunity.id, name1: targetOpportunity.name1 } } : { opportunity: undefined }),
          },
        });
        if (targetAccount?.id) {
          await touchAccountLastContacted(targetAccount.id, new Date(formData.visitDate).toISOString());
        }
        toast.success(locale === 'zh-Hans' ? '活动已更新' : 'Activity updated');
      } else {
        // Create new activity
        await createActivity.mutateAsync({
          title,
          typeKey: 'TypeKey0', // visit
          draftstatusKey: 'DraftstatusKey1', // confirmed
          ownerid: user?.objectId || '',
          scheduleddate: new Date(formData.visitDate).toISOString(),
          notes,
          // Set account lookup if selected
          ...(targetAccount ? { account: { id: targetAccount.id, name1: targetAccount.name1 } } : {}),
          // Set contact lookup if selected
          ...(targetContact ? { contact: { id: targetContact.id, fullname: targetContact.fullname } } : {}),
          // Set opportunity lookup if selected
          ...(targetOpportunity ? { opportunity: { id: targetOpportunity.id, name1: targetOpportunity.name1 } } : {}),
        });
        if (targetAccount?.id) {
          await touchAccountLastContacted(targetAccount.id, new Date(formData.visitDate).toISOString());
        }
        toast.success(locale === 'zh-Hans' ? '活动已保存' : 'Activity saved');
      }

      // Analyze for potential opportunities (only for new activities)
      if (!isEditMode && copilotEnabled) {
        toast.info(locale === 'zh-Hans' ? '正在分析潜在商机...' : 'Analyzing potential opportunities...');
        
        const oppAnalysis = await analyzeOpportunity(formData);
        
        if (oppAnalysis?.hasOpportunity) {
          const stageKeyMap: Record<string, string> = {
            prospecting: 'StageKey0',
            qualification: 'StageKey1',
            proposal: 'StageKey2',
            negotiation: 'StageKey3',
            won: 'StageKey4',
            lost: 'StageKey5',
          };

          if (oppAnalysis.matchingOpportunityId) {
            // Update existing opportunity
            const existingOpp = opportunities.find((o) => o.id === oppAnalysis.matchingOpportunityId);
            if (existingOpp) {
              await updateOpportunity.mutateAsync({
                id: oppAnalysis.matchingOpportunityId,
                changedFields: {
                  lastaction: formData.result,
                  confidence: oppAnalysis.confidence,
                  ...(oppAnalysis.stage && { stageKey: stageKeyMap[oppAnalysis.stage] as 'StageKey0' | 'StageKey1' | 'StageKey2' | 'StageKey3' | 'StageKey4' | 'StageKey5' }),
                  ...(oppAnalysis.expectedCloseDate && { expectedclosedate: oppAnalysis.expectedCloseDate }),
                },
              });
              toast.success(
                locale === 'zh-Hans'
                  ? `已更新商机：${existingOpp.name1}`
                  : `Updated opportunity: ${existingOpp.name1}`
              );
            }
          } else if (!formData.opportunityId) {
            // Only create new opportunity if none was selected
            const targetAccount = formData.accountId
              ? accounts.find((a) => a.id === formData.accountId)
              : accounts.find((a) => a.id === accountId);
            if (targetAccount) {
              await createOpportunity.mutateAsync({
                name1: oppAnalysis.opportunityName || `${formData.accountName} - ${formData.opportunityIntent || 'New Opportunity'}`,
                // Set account lookup - required field
                account: { id: targetAccount.id, name1: targetAccount.name1 },
                totalamount: oppAnalysis.totalAmount || 0,
                stageKey: (stageKeyMap[oppAnalysis.stage || 'prospecting'] || 'StageKey0') as 'StageKey0' | 'StageKey1' | 'StageKey2' | 'StageKey3' | 'StageKey4' | 'StageKey5',
                confidence: oppAnalysis.confidence || 50,
                ownerid: user?.objectId || '',
                lastaction: formData.result,
                ...(oppAnalysis.expectedCloseDate && { expectedclosedate: oppAnalysis.expectedCloseDate }),
              });
              toast.success(
                locale === 'zh-Hans'
                  ? `已创建新商机：${oppAnalysis.opportunityName || formData.opportunityIntent}`
                  : `Created new opportunity: ${oppAnalysis.opportunityName || formData.opportunityIntent}`
              );
              await refetchOpportunities();
            }
          }
        }
      }

      // Navigate back - use the canonical activity ID
      navigate(isEditMode && activityId ? `/activities/${activityId}` : '/home');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save activity');
    } finally {
      setIsProcessing(false);
    }
  };

  // Discard and go back - use the canonical activity ID
  const handleDiscard = () => {
    navigate(isEditMode && activityId ? `/activities/${activityId}` : '/home');
  };

  // Page title based on mode
  const pageTitle = isEditMode
    ? (locale === 'zh-Hans' ? '编辑活动' : 'Edit Activity')
    : t('newVisitTitle', locale);

  // Show loading state in edit mode while waiting for activity data
  if (isEditMode && isLoadingActivity) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <header className="fixed top-0 left-0 right-0 z-40 glass-surface border-b border-border/50 safe-area-top">
          <div className="flex items-center justify-between h-14 px-4">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-title text-foreground">{locale === 'zh-Hans' ? '加载中...' : 'Loading...'}</h1>
            <div className="w-10" />
          </div>
        </header>
        <main className="flex-1 pt-14 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  // Show error state if activity not found in edit mode
  if (isEditMode && !isLoadingActivity && !existingActivity) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <header className="fixed top-0 left-0 right-0 z-40 glass-surface border-b border-border/50 safe-area-top">
          <div className="flex items-center justify-between h-14 px-4">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-title text-foreground">{locale === 'zh-Hans' ? '未找到' : 'Not Found'}</h1>
            <div className="w-10" />
          </div>
        </header>
        <main className="flex-1 pt-14 flex flex-col items-center justify-center text-center px-4">
          <p className="text-lg font-medium text-foreground">{locale === 'zh-Hans' ? '活动记录未找到' : 'Activity not found'}</p>
          <p className="text-sm text-muted-foreground mt-2">{locale === 'zh-Hans' ? '该记录可能已被删除' : 'This record may have been deleted'}</p>
          <button
            onClick={() => navigate('/activities')}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground"
          >
            {locale === 'zh-Hans' ? '返回活动列表' : 'Back to Activities'}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-helper font-medium safe-area-top">
          <WifiOff className="w-4 h-4" />
          <span>{t('offlineRecordingHint', locale)}</span>
        </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 glass-surface border-b border-border/50 safe-area-top">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-title text-foreground truncate max-w-[200px]">
            {pageTitle} · {existingActivity?.account?.name1 || account?.name1 || '...'}
          </h1>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="More"
          >
            <MoreHorizontal className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pt-14 pb-32 px-4 overflow-y-auto">
        <div className="space-y-4 py-4">
          {/* AI Assistant indicator */}
          {copilotEnabled && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                isAIFilled 
                  ? "bg-emerald-500/10 border border-emerald-500/30" 
                  : "bg-primary/10 border border-primary/30"
              )}
            >
              <Sparkles className={cn("w-4 h-4", isAIFilled ? "text-emerald-500" : "text-primary")} />
              <span className={cn(isAIFilled ? "text-emerald-700 dark:text-emerald-300" : "text-primary")}>
                {isAIFilled
                  ? (locale === 'zh-Hans' ? 'AI 已填充，请检查并修改' : 'AI filled - review and edit')
                  : (locale === 'zh-Hans' ? '在下方 Copilot 输入框描述拜访内容，AI 将自动填充表单' : 'Describe your visit in the Copilot input below, AI will fill the form')}
              </span>
            </motion.div>
          )}

          {/* Activity Form */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-xl p-4 space-y-4"
          >
            {/* Title */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-helper text-muted-foreground">
                <FileText className="w-4 h-4" />
                {locale === 'zh-Hans' ? '标题' : 'Title'}
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                className={cn(
                  "w-full px-3 py-2.5 rounded-lg bg-muted/50 border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors",
                  isAIFilled && formData.title ? "border-emerald-500/50" : "border-border/30"
                )}
                placeholder={locale === 'zh-Hans' ? '拜访标题（可选）' : 'Visit title (optional)'}
              />
            </div>

            {/* Account */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-helper text-muted-foreground">
                <Building2 className="w-4 h-4" />
                {t('account', locale)}
              </label>
              <Select
                value={formData.accountId || 'none'}
                onValueChange={(val: string) => {
                  const selectedAccount = accounts.find((a) => a.id === val);
                  setFormData((prev) => ({
                    ...prev,
                    accountId: val === 'none' ? '' : val,
                    accountName: selectedAccount?.name1 || '',
                    // Reset contact and opportunity when account changes
                    contactId: '',
                    contactName: '',
                    opportunityId: '',
                    opportunityName: '',
                  }));
                }}
              >
                <SelectTrigger
                  className={cn(
                    "w-full rounded-lg bg-muted/50 border text-foreground",
                    isAIFilled && formData.accountId ? "border-emerald-500/50" : "border-border/30"
                  )}
                >
                  <SelectValue placeholder={locale === 'zh-Hans' ? '选择客户' : 'Select account'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{filteredContacts.length === 0 ? (locale === 'zh-Hans' ? '暂无联系人数据' : 'No contacts available') : (locale === 'zh-Hans' ? '不选择' : 'None')}</SelectItem>
                  {accounts.filter((a) => a.id).map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-helper text-muted-foreground">
                <User className="w-4 h-4" />
                {t('contact', locale)}
              </label>
              <Select
                value={formData.contactId || 'none'}
                onValueChange={(val: string) => {
                  const selectedContact = contacts.find((c) => c.id === val);
                  setFormData((prev) => ({
                    ...prev,
                    contactId: val === 'none' ? '' : val,
                    contactName: selectedContact?.fullname || '',
                  }));
                }}
              >
                <SelectTrigger
                  className={cn(
                    "w-full rounded-lg bg-muted/50 border text-foreground",
                    isAIFilled && formData.contactId ? "border-emerald-500/50" : "border-border/30"
                  )}
                >
                  <SelectValue placeholder={locale === 'zh-Hans' ? '选择联系人' : 'Select contact'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{filteredContacts.length === 0 ? (locale === 'zh-Hans' ? '暂无联系人数据' : 'No contacts available') : (locale === 'zh-Hans' ? '不选择' : 'None')}</SelectItem>
                  {filteredContacts.filter((c) => c.id).map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      <div className="flex flex-col items-start text-left">
                        <span>{contact.fullname}</span>
                        {contact.title && <span className="text-xs text-muted-foreground">{contact.title}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Opportunity */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-helper text-muted-foreground">
                <Target className="w-4 h-4" />
                {locale === 'zh-Hans' ? '关联商机' : 'Related Opportunity'}
              </label>
              <Select
                value={formData.opportunityId || 'none'}
                onValueChange={(val: string) => {
                  const selectedOpp = opportunities.find((o) => o.id === val);
                  setFormData((prev) => ({
                    ...prev,
                    opportunityId: val === 'none' ? '' : val,
                    opportunityName: selectedOpp?.name1 || '',
                  }));
                }}
              >
                <SelectTrigger
                  className={cn(
                    "w-full rounded-lg bg-muted/50 border text-foreground",
                    isAIFilled && formData.opportunityId ? "border-emerald-500/50" : "border-border/30"
                  )}
                >
                  <SelectValue placeholder={locale === 'zh-Hans' ? '选择商机（可选）' : 'Select opportunity (optional)'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{filteredOpportunities.length === 0 ? (locale === 'zh-Hans' ? '暂无商机数据' : 'No opportunities available') : (locale === 'zh-Hans' ? '不选择' : 'None')}</SelectItem>
                  {filteredOpportunities.filter((o) => o.id).map((opp) => (
                    <SelectItem key={opp.id} value={opp.id}>
                      <div className="flex flex-col items-start text-left">
                        <span>{opp.name1}</span>
                        {opp.totalamount && <span className="text-xs text-muted-foreground">¥{opp.totalamount.toLocaleString()}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Visit Date */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-helper text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {t('visitDate', locale)}
              </label>
              <input
                type="date"
                value={formData.visitDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData((prev) => ({ ...prev, visitDate: e.target.value }))
                }
                className={cn(
                  "w-full px-3 py-2.5 rounded-lg bg-muted/50 border text-foreground outline-none focus:border-primary/50 transition-colors",
                  isAIFilled && formData.visitDate ? "border-emerald-500/50" : "border-border/30"
                )}
              />
            </div>

            {/* Visit Result */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-helper text-muted-foreground">
                <FileText className="w-4 h-4" />
                {t('result', locale)} *
              </label>
              <textarea
                value={formData.result}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setFormData((prev) => ({ ...prev, result: e.target.value }))
                }
                className={cn(
                  "w-full min-h-[140px] px-3 py-2.5 rounded-lg bg-muted/50 border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors resize-none",
                  isAIFilled && formData.result ? "border-emerald-500/50" : "border-border/30"
                )}
                placeholder={locale === 'zh-Hans' ? '拜访结果和讨论要点' : 'Visit outcome and key discussion points'}
              />
            </div>

            {/* Next Step */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-helper text-muted-foreground">
                <ArrowRight className="w-4 h-4" />
                {t('nextStep', locale)}
              </label>
              <input
                type="text"
                value={formData.nextStep}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData((prev) => ({ ...prev, nextStep: e.target.value }))
                }
                className={cn(
                  "w-full px-3 py-2.5 rounded-lg bg-muted/50 border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors",
                  isAIFilled && formData.nextStep ? "border-emerald-500/50" : "border-border/30"
                )}
                placeholder={locale === 'zh-Hans' ? '下一步行动' : 'Next action'}
              />
            </div>

            {/* Opportunity Intent (text input for new opportunities) */}
            {!formData.opportunityId && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-helper text-muted-foreground">
                  <Target className="w-4 h-4" />
                  {t('opportunityIntent', locale)}
                </label>
                <input
                  type="text"
                  value={formData.opportunityIntent}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData((prev) => ({ ...prev, opportunityIntent: e.target.value }))
                  }
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg bg-muted/50 border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors",
                    isAIFilled && formData.opportunityIntent ? "border-emerald-500/50" : "border-border/30"
                  )}
                  placeholder={locale === 'zh-Hans' ? '商机/意向（AI可自动创建商机）' : 'Opportunity/Intent (AI can auto-create)'}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleDiscard}
                className="flex-1 py-3 rounded-xl text-body font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-border/30"
              >
                {locale === 'zh-Hans' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl accent-gradient text-body font-semibold text-white shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {locale === 'zh-Hans' ? '保存拜访记录' : 'Save Visit Log'}
              </button>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
