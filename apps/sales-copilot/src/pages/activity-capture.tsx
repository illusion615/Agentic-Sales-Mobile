import { useState, useEffect, useMemo, useRef } from 'react';
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
  Sparkles,
} from 'lucide-react';
import { toast } from '@/lib/toast-utils';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useAccountList } from '@/generated/hooks/use-account';
import { useCreateActivity, useActivity, useUpdateActivity } from '@/generated/hooks/use-activity';
import { useEffectiveOffline } from '@/lib/connectivity';
import { enqueueActivity, type ActivityCreatePayload } from '@/lib/activity-outbox';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useContactList } from '@/generated/hooks/use-contact';
import { useWithAISummaryTrigger } from '@/hooks/use-ai-summary-trigger';
import { touchAccountLastContacted } from '@/lib/account-touch';
import { resolveActivityRelations } from '@/lib/activity-relations';
import { getLocale, t, type Locale } from '@/lib/i18n';
import { TimeDurationFields } from '@/components/schedule-picker';
import { combineDateTime, timeFromISO, DEFAULT_TIME, DEFAULT_DURATION_MINUTES } from '@/lib/activity-schedule';
import { isFlowAvailable } from '@/services/power-automate-service';
import { useCopilot } from '@/contexts/copilot-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';



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
  const copilotEnabled = isFlowAvailable();
  const copilot = useCopilot();

  // Data - use useActivity(id) for single record lookup instead of useActivityList().find()
  const { data: accounts = [] } = useAccountList();
  const {
    data: existingActivity,
    isLoading: isLoadingActivity,
    error: activityError,
  } = useActivity(editActivityId || '');
  const { data: opportunities = [] } = useOpportunityList();
  const { data: contacts = [] } = useContactList();
  // The edit route can be opened directly from a saved Copilot card, so it
  // cannot rely on an account route parameter. Resolve the form's relationship
  // context from Activity → Opportunity/Contact → Account instead.
  const resolvedActivity = useMemo(
    () => existingActivity
      ? resolveActivityRelations(existingActivity, opportunities, contacts)
      : undefined,
    [existingActivity, opportunities, contacts],
  );
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const { triggerForEntity } = useWithAISummaryTrigger();

  // Find account by param
  const account = accounts.find((a) => a.id === accountId);

  // The canonical activity ID - always use this, never the URL param directly
  const activityId = resolvedActivity?.id;

  // State
  const isOffline = useEffectiveOffline();
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
    visitTime: DEFAULT_TIME,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    visitType: 'client-visit',
    result: '',
  });

  // Parse contact from notes (stored as structured text)
  const parseNotesData = (notes: string | undefined): { result: string; contactName: string } => {
    if (!notes) return { result: '', contactName: '' };
    
    const contactMatch = notes.match(/Contact:\s*(.+?)(?:\n|$)/);
    
    // Extract the main result (before the metadata section)
    const resultEnd = notes.indexOf('\n\nContact:');
    const result = resultEnd > 0 ? notes.substring(0, resultEnd) : notes;
    
    return {
      result: result.trim(),
      contactName: contactMatch?.[1]?.trim() || '',
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
        visitTime: (draftData.scheduledTime as string)
          || ((draftData.scheduledDate as string) ? timeFromISO(draftData.scheduledDate as string) : DEFAULT_TIME),
        durationMinutes: (draftData.durationMinutes as number) || DEFAULT_DURATION_MINUTES,
        visitType: (draftData.type as string) || 'client-visit',
        result: (draftData.result as string) || '',
      });
      setIsAIFilled(true); // Mark as AI-filled since it came from Copilot
      return;
    }
    
    // Priority 2: Edit mode - load existing activity
    if (isEditMode && resolvedActivity) {
      const parsedNotes = parseNotesData(resolvedActivity.notes);
      setFormData({
        title: resolvedActivity.title || '',
        accountId: resolvedActivity.account?.id || accountId || '',
        accountName: resolvedActivity.account?.name1 || account?.name1 || '',
        contactId: resolvedActivity.contact?.id || '',
        contactName: resolvedActivity.contact?.fullname || parsedNotes.contactName,
        opportunityId: resolvedActivity.opportunity?.id || '',
        opportunityName: resolvedActivity.opportunity?.name1 || '',
        visitDate: resolvedActivity.scheduleddate ? resolvedActivity.scheduleddate.split('T')[0] : new Date().toISOString().split('T')[0],
        visitTime: resolvedActivity.scheduleddate ? timeFromISO(resolvedActivity.scheduleddate) : DEFAULT_TIME,
        durationMinutes: resolvedActivity.durationMinutes || DEFAULT_DURATION_MINUTES,
        visitType: 'client-visit',
        result: parsedNotes.result,
      });
    } else if (account?.name1 && accountId) {
      // Priority 3: Account from URL param
      setFormData((prev) => ({ ...prev, accountId, accountName: account.name1 }));
    }
  }, [draftData, isEditMode, resolvedActivity, account, accountId]);

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
        ? `正在为客户 ${account?.name1 || '未选择'} 创建拜访记录。`
        : `Creating visit record for account ${account?.name1 || 'not selected'}.`,
      pageData: {
        accountId,
        accountName: account?.name1,
        formFields: ['title', 'accountName', 'contactName', 'visitDate', 'result'],
      },
    });

    // Cleanup on unmount
    return () => {
      copilot.setInputPlaceholder('');
      copilot.setPageContext(null);
    };
  }, [copilot.setInputPlaceholder, copilot.setPageContext, locale, account?.name1, accountId]);

  // Submit form (create or update)
  const handleSubmit = async () => {
    if (!formData.result.trim()) {
      toast.error(t('enterVisitResult', locale));
      return;
    }

    // In edit mode, ensure activity exists
    if (isEditMode && !activityId) {
      toast.error(t('activityRecordNotFound', locale));
      return;
    }

    setIsProcessing(true);

    try {
      const title = formData.title || `${t('newVisitTitle', locale)} - ${formData.accountName || account?.name1 || 'Unknown'}`;
      const notes = `${formData.result}\n\nContact: ${formData.contactName}`;
      
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
      
      // Build the create payload once — it can go to Dataverse or, when offline,
      // to the append-only outbox for later automatic sync.
      const createPayload: ActivityCreatePayload = {
        title,
        type: 'visit',
        status: 'open',
        ownerid: user?.objectId || '',
        scheduleddate: combineDateTime(formData.visitDate, formData.visitTime),
        durationMinutes: formData.durationMinutes,
        notes,
        ...(targetAccount ? { account: { id: targetAccount.id, name1: targetAccount.name1 } } : {}),
        ...(targetContact ? { contact: { id: targetContact.id, fullname: targetContact.fullname } } : {}),
        ...(targetOpportunity ? { opportunity: { id: targetOpportunity.id, name1: targetOpportunity.name1 } } : {}),
      };

      // Save activity
      if (isEditMode && activityId) {
        // Editing an existing record is blocked offline: it would risk a conflict
        // when it later syncs. Only brand-new activities can be queued offline.
        if (isOffline) {
          toast.error(t('offlineEditBlocked', locale));
          setIsProcessing(false);
          return;
        }
        // Update existing activity - include account, contact, and opportunity
        await updateActivity.mutateAsync({
          id: activityId,
          changedFields: {
            title,
            scheduleddate: combineDateTime(formData.visitDate, formData.visitTime),
            durationMinutes: formData.durationMinutes,
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
        toast.success(t('activityUpdated', locale));
      } else if (isOffline) {
        // Offline: queue the create for automatic sync on reconnect. The account
        // "last contacted" touch is a server edit, so it is skipped here and will
        // reflect naturally once the queued activity syncs.
        await enqueueActivity(createPayload);
        toast.success(t('offlineSavedActivity', locale));
      } else {
        // Create new activity
        await createActivity.mutateAsync(createPayload);
        if (targetAccount?.id) {
          await touchAccountLastContacted(targetAccount.id, new Date(formData.visitDate).toISOString());
        }
        toast.success(t('activitySaved', locale));
      }

      // Navigate back - use the canonical activity ID
      navigate(isEditMode && activityId ? `/activities/${activityId}` : '/home');
    } catch (error: unknown) {
      // Toast is shown by the global MutationCache.onError handler.
      console.error('Failed to save activity:', error);
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
    ? (t('editActivityTitle', locale))
    : t('newVisitTitle', locale);

  // Show loading state in edit mode while waiting for activity data
  if (isEditMode && isLoadingActivity) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 safe-area-top">
          <div className="flex items-center justify-between h-14 px-4">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-title text-foreground">{t('loading', locale)}</h1>
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
        <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 safe-area-top">
          <div className="flex items-center justify-between h-14 px-4">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="text-title text-foreground">{t('notFound', locale)}</h1>
            <div className="w-10" />
          </div>
        </header>
        <main className="flex-1 pt-14 flex flex-col items-center justify-center text-center px-4">
          <p className="text-lg font-medium text-foreground">{t('activityNotFound', locale)}</p>
          <p className="text-sm text-muted-foreground mt-2">{t('recordMayBeDeleted', locale)}</p>
          <button
            onClick={() => navigate('/activities')}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground"
          >
            {t('backToActivities', locale)}
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
      <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 safe-area-top">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-title text-foreground truncate max-w-[200px]">
            {pageTitle} · {resolvedActivity?.account?.name1 || account?.name1 || '...'}
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
          {/* AI Assistant indicator - only when the form was pre-filled from a Copilot draft */}
          {copilotEnabled && isAIFilled && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/30"
            >
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span className="text-emerald-700 dark:text-emerald-300">
                {t('aiFilledReview', locale)}
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
                {t('fieldTitle', locale)}
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
                placeholder={t('visitTitleOptional', locale)}
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
                  <SelectValue placeholder={t('formSelectAccount', locale)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{filteredContacts.length === 0 ? (t('noContactsAvailable', locale)) : (t('dontSelect', locale))}</SelectItem>
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
                  <SelectValue placeholder={t('selectContact', locale)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{filteredContacts.length === 0 ? (t('noContactsAvailable', locale)) : (t('dontSelect', locale))}</SelectItem>
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
                {t('relatedOpportunity', locale)}
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
                  <SelectValue placeholder={t('formSelectOpportunity', locale)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{filteredOpportunities.length === 0 ? (t('noOpportunitiesAvailable', locale)) : (t('dontSelect', locale))}</SelectItem>
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

            {/* Visit Time & Duration */}
            <TimeDurationFields
              time={formData.visitTime}
              durationMinutes={formData.durationMinutes}
              onTimeChange={(v) => setFormData((prev) => ({ ...prev, visitTime: v }))}
              onDurationChange={(v) => setFormData((prev) => ({ ...prev, durationMinutes: v }))}
              locale={locale}
            />

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
                placeholder={t('visitOutcomePlaceholder', locale)}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleDiscard}
                className="flex-1 py-3 rounded-xl text-body font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-border/30"
              >
                {t('cancel', locale)}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isProcessing || (isOffline && isEditMode)}
                className="flex-1 py-3 rounded-xl accent-gradient text-body font-semibold text-white shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {t('saveVisitLog', locale)}
              </button>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
