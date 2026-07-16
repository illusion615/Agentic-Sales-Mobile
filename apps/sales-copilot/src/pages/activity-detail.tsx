import { useMemo, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { industryLabel } from '@/lib/industry';
import {
  Phone,
  Calendar,
  CheckSquare,
  Mail,
  MapPin,
  Clock,
  Building2,
  User,
  Target,
  FileText,
  ArrowRight,
  Edit,
  Trash2,
  CheckCircle,
  CalendarClock,
  ChevronDown,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVITY_TYPE_COLORS } from '@/lib/activity-colors';
import { activityStatusMeta } from '@/lib/activity-status';
import { resolveActivityRelations } from '@/lib/activity-relations';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { AISummaryCard } from '@/components/ai-summary-card';
import type { InsightAction } from '@/lib/insight-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useActivity, useUpdateActivity, useDeleteActivity, useCreateActivity } from '@/generated/hooks/use-activity';
import { useQueryClient } from '@tanstack/react-query';
import { useContactList } from '@/generated/hooks/use-contact';
import { useAccountList } from '@/generated/hooks/use-account';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import type { Contact } from '@/generated/models/contact-model';import type { Account } from '@/generated/models/account-model';import type { Opportunity, OpportunityStageKeyToLabel as OpportunityStageKeyToLabelType } from '@/generated/models/opportunity-model';import { useEntityAISummary, useWithAISummaryTrigger } from '@/hooks/use-ai-summary-trigger';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import type { Activity as DataverseActivity } from '@/generated/models/activity-model';import { toast } from '@/lib/toast-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ClientProfileSheet } from '@/components/client-profile-sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getLocale, t } from '@/lib/i18n';
import { ReschedulePickerBody } from '@/components/schedule-picker';
import { combineDateTime, formatDuration, resolveScheduleValue, type ScheduleValue } from '@/lib/activity-schedule';
import { useCopilot } from '@/contexts/copilot-context';
import { PullToRefresh } from '@/components/pull-to-refresh';

const activityIcons: Record<string, typeof Phone> = {
  visit: Calendar,
  call: Phone,
  meeting: Calendar,
  email: Mail,
  other: CheckSquare,
};

// Activity type colors come from the shared single source of truth so the
// detail header icon matches Home and the Activities list (D10).
const activityColors: Record<string, string> = Object.fromEntries(
  Object.entries(ACTIVITY_TYPE_COLORS).map(([type, c]) => [type, c.solid]),
);

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Use useActivity(id) for single record lookup - not useActivityList().find()
  // Use useActivity(id) for single record lookup - not useActivityList().find()
  // Pass undefined when id is missing to prevent query from running
  const { data: storedActivity, isLoading, error: activityError } = useActivity(id ?? '');
  const { data: contacts = [] } = useContactList();
  const { data: accounts = [] } = useAccountList();
  const { data: allOpportunities = [] } = useOpportunityList();
  // Dataverse activities have one polymorphic Regarding lookup. When it points
  // to an opportunity/contact, reconstruct the parent account so the detail
  // view consistently exposes the fullest useful business context.
  const activity = useMemo(
    () => storedActivity ? resolveActivityRelations(storedActivity, allOpportunities, contacts) : undefined,
    [storedActivity, allOpportunities, contacts],
  );

  // Saved file attachments (Dataverse Notes) bound to this activity.
  const [savedAttachments, setSavedAttachments] = useState<import('@/lib/attachments').SavedAttachment[]>([]);
  const [lightboxAttachment, setLightboxAttachment] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setSavedAttachments([]); return; }
    let cancelled = false;
    import('@/lib/attachments').then(({ fetchActivityAttachments }) =>
      fetchActivityAttachments(id).then((atts) => { if (!cancelled) setSavedAttachments(atts); })
    );
    return () => { cancelled = true; };
  }, [id]);

  // Prefetch related entity detail chunks (account, opportunity, contact)
  useEffect(() => {
    import('@/lib/prefetch').then(({ prefetchRelated }) => prefetchRelated('activity'));
  }, []);
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
  const createActivity = useCreateActivity();
  const queryClient = useQueryClient();

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['activity', id] }),
      queryClient.invalidateQueries({ queryKey: ['contact-list'] }),
      queryClient.invalidateQueries({ queryKey: ['account-list'] }),
      queryClient.invalidateQueries({ queryKey: ['opportunity-list'] }),
    ]);
  }, [queryClient, id]);

  // AI Summary hooks
  const { summary: aiSummary, isLoading: isLoadingAISummary, isGenerating, isExpired, isFailed, localeMismatch, refetch: refetchAISummary } = useEntityAISummary('activity', id || '');
  const { triggerForEntity, isTriggering } = useWithAISummaryTrigger();
  const { settings: businessSettings } = useBusinessSettings();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const locale = getLocale();

  // Find contacts related to this activity's account
  const relatedContacts = useMemo(() => {
    if (!activity?.account?.id) return [];
    return contacts.filter((c: Contact) => c.account?.id === activity.account?.id);
  }, [contacts, activity?.account?.id]);

  // Find full account details
  const fullAccount = useMemo(() => {
    if (!activity?.account?.id) return null;
    return accounts.find((a: Account) => a.id === activity.account?.id);
  }, [accounts, activity?.account?.id]);

  // Find full opportunity details
  const fullOpportunity = useMemo(() => {
    if (!activity?.opportunity?.id) return null;
    return allOpportunities.find((o: Opportunity) => o.id === activity.opportunity?.id);
  }, [allOpportunities, activity?.opportunity?.id]);

  // Copilot context for agent awareness
  const copilot = useCopilot();

  // Set page context for Copilot agent awareness
  useEffect(() => {
    if (!activity) return;
    
    const typeLabel = activity.type;
    const statusLabel = activity.status;
    
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '活动详情' : 'Activity Detail',
      summary: locale === 'zh-Hans'
        ? `查看活动: ${activity.title}，类型: ${typeLabel}，状态: ${statusLabel}，客户: ${fullAccount?.name1 || '未关联'}，商机: ${fullOpportunity?.name1 || '无'}`
        : `Viewing activity: ${activity.title}, Type: ${typeLabel}, Status: ${statusLabel}, Account: ${fullAccount?.name1 || 'Not linked'}, Opportunity: ${fullOpportunity?.name1 || 'None'}`,
      pageData: {
        activityId: activity.id,
        activityTitle: activity.title,
        type: typeLabel,
        status: statusLabel,
        scheduledDate: activity.scheduleddate,
        notes: activity.notes,
        accountId: activity.account?.id,
        accountName: fullAccount?.name1,
        opportunityId: activity.opportunity?.id,
        opportunityName: fullOpportunity?.name1,
        contactsCount: relatedContacts.length,
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [activity, fullAccount, fullOpportunity, relatedContacts.length, locale, copilot.setPageContext]);

  // Local state for immediate refresh feedback
  const [isRefreshingAI, setIsRefreshingAI] = useState(false);

  const handleRefreshAISummary = useCallback(() => {
    if (!activity) return;
    setIsRefreshingAI(true);
    triggerForEntity('activity', activity.id, JSON.parse(JSON.stringify(activity)), {
      account: activity.account ? { id: activity.account.id, name: activity.account.name1, industry: fullAccount?.industry } : undefined,
      opportunity: activity.opportunity ? { id: activity.opportunity.id, name: activity.opportunity.name1, stage: fullOpportunity?.stage, confidence: fullOpportunity?.confidence, amount: fullOpportunity?.totalamount, closeDate: fullOpportunity?.expectedclosedate } : undefined,
    });
    setTimeout(() => {
      refetchAISummary();
      setIsRefreshingAI(false);
    }, 500);
  }, [activity, fullAccount, fullOpportunity, triggerForEntity, refetchAISummary]);

  // Create a follow-up activity from a structured insight action, linked to THIS
  // activity's account + opportunity (closes the loop insight → action → record).
  const handleCreateInsightTask = useCallback(async (action: InsightAction, scheduledDate: string): Promise<string | null> => {
    if (!activity) return null;
    try {
      const created = await createActivity.mutateAsync({
        title: action.title,
        type: action.type,
        scheduleddate: scheduledDate,
        status: 'open',
        ownerid: '',
        ...(action.explanation ? { notes: action.explanation } : {}),
        ...(activity.account ? { account: activity.account } : {}),
        ...(activity.opportunity ? { opportunity: activity.opportunity } : {}),
      } as Parameters<typeof createActivity.mutateAsync>[0]);
      return (created as { id?: string })?.id ?? null;
    } catch {
      toast.error(t('suggestedTasksFailed', locale));
      return null;
    }
  }, [activity, createActivity, locale]);

  // Regenerate the insight when the user switched language since it was generated.
  useEffect(() => {
    if (localeMismatch && activity && !isGenerating && !isTriggering && !isRefreshingAI) {
      handleRefreshAISummary();
    }
  }, [localeMismatch, activity, isGenerating, isTriggering, isRefreshingAI, handleRefreshAISummary]);

  const handleMarkComplete = async () => {
    if (!activity) return;
    // Guard against double-taps: the dock chip stays interactive until the dock
    // re-renders, so re-entry is possible. updateActivity.isPending also drives
    // the chip's busy state, but guard here too so a fast second tap is a no-op.
    if (updateActivity.isPending) return;
    queryClient.setQueryData(['activity', activity.id], (old?: DataverseActivity) => (old ? { ...old, status: 'completed' } : old));
    try {
      await updateActivity.mutateAsync({
        id: activity.id,
        changedFields: {
          status: 'completed',
        },
      });
      
      // Trigger AI summary generation after completing
      triggerForEntity('activity', activity.id, {
        ...activity,
        status: 'completed',
      } as Record<string, unknown>, {
        account: activity.account ? { id: activity.account.id, name: activity.account.name1, industry: fullAccount?.industry } : undefined,
        opportunity: activity.opportunity ? { id: activity.opportunity.id, name: activity.opportunity.name1, stage: fullOpportunity?.stage, confidence: fullOpportunity?.confidence, amount: fullOpportunity?.totalamount, closeDate: fullOpportunity?.expectedclosedate } : undefined,
      } as Record<string, unknown>);
      // Status badge updates inline via query invalidation; no toast.
    } catch (error: unknown) {
      toast.error('Failed to update activity');
    }
  };

  const handleReschedule = async (value: ScheduleValue) => {
    if (!activity || updateActivity.isPending) return;
    setRescheduleOpen(false);
    try {
      await updateActivity.mutateAsync({
        id: activity.id,
        changedFields: {
          scheduleddate: combineDateTime(value.date, value.time),
          durationMinutes: value.durationMinutes,
        },
      });
    } catch {
      toast.error('Failed to update activity');
    }
  };

  const handleCancelActivity = async () => {
    if (!activity || updateActivity.isPending) return;
    queryClient.setQueryData(['activity', activity.id], (old?: DataverseActivity) => (old ? { ...old, status: 'canceled' } : old));
    try {
      await updateActivity.mutateAsync({ id: activity.id, changedFields: { status: 'canceled' } });
    } catch {
      toast.error('Failed to update activity');
    }
  };

  const handleReopen = async () => {
    if (!activity || updateActivity.isPending) return;
    queryClient.setQueryData(['activity', activity.id], (old?: DataverseActivity) => (old ? { ...old, status: 'open' } : old));
    try {
      await updateActivity.mutateAsync({ id: activity.id, changedFields: { status: 'open' } });
    } catch {
      toast.error('Failed to update activity');
    }
  };

  const handleDelete = async () => {
    if (!activity) return;
    try {
      await deleteActivity.mutateAsync(activity.id);
      // Returning to the list (item now gone) is the feedback; no toast.
      navigate('/activities');
    } catch (error: unknown) {
      toast.error('Failed to delete activity');
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title={t('activityDetails', locale)}>
        <div className="px-4 pb-40 space-y-4 mt-4">
          <div className="glass-card p-4 animate-pulse" style={{ borderRadius: 20 }}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-muted/50" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-3/4 rounded bg-muted/50" />
                <div className="h-4 w-1/2 rounded bg-muted/40" />
                <div className="h-4 w-1/3 rounded bg-muted/40" />
              </div>
            </div>
          </div>
          <div className="glass-card p-4 animate-pulse space-y-3" style={{ borderRadius: 20 }}>
            {[0,1,2,3].map(i => <div key={i} className="flex justify-between"><div className="h-4 w-20 rounded bg-muted/40" /><div className="h-4 w-32 rounded bg-muted/50" /></div>)}
          </div>
          <div className="glass-card p-4 animate-pulse space-y-2" style={{ borderRadius: 20 }}>
            <div className="h-5 w-20 rounded bg-muted/50" />
            <div className="h-16 rounded bg-muted/30" />
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (activityError || !activity) {
    return (
      <MobileLayout title="Activity">
        <Empty className="py-20">
          <EmptyHeader>
            <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
            <EmptyTitle>Activity not found</EmptyTitle>
            <EmptyDescription>This record may have been deleted</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/activities')}>
            Back to Activities
          </Button>
        </Empty>
      </MobileLayout>
    );
  }

  const typeLabel = activity.type;
  const Icon = activityIcons[typeLabel] || CheckSquare;
  const color = activityColors[typeLabel] || 'bg-muted';
  // Status pill/label + title decoration come from the single source of truth
  // (lib/activity-status) so the detail page, the list and the relation pages
  // all render the three states identically.
  const statusMeta = activityStatusMeta(activity, locale);
  const isCompleted = statusMeta.status === 'completed';
  const isCanceled = statusMeta.status === 'canceled';
  const StatusIcon = statusMeta.icon;

  const deleteButton = (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogTrigger asChild>
        <button
          className="p-2 rounded-full hover:bg-destructive/10 transition-colors"
          aria-label="Delete activity"
        >
          <Trash2 className="w-5 h-5 text-destructive" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Activity</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this activity? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Header actions: Edit (primary entry, was a hidden dock chip) + Delete.
  const headerActions = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigate(`/activity/${activity.account?.id || 'new'}?edit=${activity.id}`)}
        className="p-2 rounded-full hover:bg-muted/50 transition-colors"
        aria-label={t('editActivity', locale)}
      >
        <Edit className="w-5 h-5 text-foreground" />
      </button>
      {deleteButton}
    </div>
  );

  return (
    <MobileLayout title="Activity Details" hideVoiceButton headerRight={headerActions}>
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto">
        {/* Main scrollable content - add padding bottom for fixed action bar */}
        <motion.div
          className="py-4 space-y-4 pb-48"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' as const }}
        >
        {/* Header Card */}
        <GlassCard className="space-y-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center flex-shrink-0`}
            >
              <Icon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={cn('text-lg font-semibold mb-1', statusMeta.titleClass)}>
                {activity.title}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', statusMeta.pillClass)}>
                  {StatusIcon && <StatusIcon className="w-3 h-3" />}
                  {statusMeta.label}
                </span>
                <Badge variant="outline" className="capitalize">
                  {typeLabel}
                </Badge>
              </div>
            </div>
          </div>

          {/* Date & Time — tap to reschedule (date + time + duration) when the activity is open */}
          {!isCompleted && !isCanceled ? (
            <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
                >
                  <Calendar className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(activity.scheduleddate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(activity.scheduleddate)}
                      {activity.durationMinutes ? ` · ${formatDuration(activity.durationMinutes, locale)}` : ''}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                    <CalendarClock className="w-4 h-4" />
                    {t('reschedule', locale)}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <ReschedulePickerBody
                  initial={resolveScheduleValue(activity.scheduleddate, activity.durationMinutes)}
                  onConfirm={handleReschedule}
                  confirming={updateActivity.isPending}
                />
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <Calendar className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(activity.scheduleddate)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(activity.scheduleddate)}
                  {activity.durationMinutes ? ` · ${formatDuration(activity.durationMinutes, locale)}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Quick actions — mark done / cancel (open) or reopen (done/cancelled); reschedule merged into the Date & Time card above */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isCompleted && !isCanceled ? (
              <>
                <button
                  type="button"
                  onClick={handleMarkComplete}
                  disabled={updateActivity.isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('markDone', locale)}
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={updateActivity.isPending}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-muted/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      <Ban className="w-4 h-4" />
                      {t('cancelTask', locale)}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('cancelTaskConfirmTitle', locale)}</AlertDialogTitle>
                      <AlertDialogDescription>{t('cancelTaskConfirmDesc', locale)}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('keepTask', locale)}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancelActivity}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t('cancelTask', locale)}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <button
                type="button"
                onClick={handleReopen}
                disabled={updateActivity.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-muted/60 text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {t('reopen', locale)}
              </button>
            )}
          </div>
          {/* Related context — account / attendees / opportunity (merged into the activity card) */}
          {(activity.account || activity.contact || (activity.contacts && activity.contacts.length > 0) || activity.opportunity) && (
            <div className="space-y-2 pt-1">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('relatedContext', locale)}
              </h2>
            {/* Combined Context Grid */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/20 border border-border/50">
              {/* Account Section */}
              {activity.account && (
                <div
                  className="flex items-start gap-3 cursor-pointer hover:bg-muted/30 -m-2 p-2 rounded-lg transition-colors"
                  onClick={() => setProfileSheetOpen(true)}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {activity.account.name1}
                      </p>
                      <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {fullAccount?.industry && (
                        <span>{industryLabel(fullAccount.industry) || fullAccount.industry}</span>
                      )}
                      {fullAccount?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {fullAccount.phone}
                        </span>
                      )}
                    </div>
                    {fullAccount?.address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{fullAccount.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Divider */}
              {activity.account && (activity.contact || (activity.contacts && activity.contacts.length > 0) || activity.opportunity) && (
                <div className="border-t border-border/50 my-3" />
              )}

              {/* Attendees Section — multiple participants (visit/meeting) */}
              {activity.contacts && activity.contacts.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('attendeesCount', locale, { count: activity.contacts.length })}
                  </p>
                  {activity.contacts.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-start gap-3 cursor-pointer hover:bg-muted/30 -m-2 p-2 rounded-lg transition-colors"
                      onClick={() => navigate(`/contacts/${att.id}`)}
                    >
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {att.fullname}
                          </p>
                          <ArrowRight className="w-3.5 h-3.5 text-accent-foreground flex-shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {att.email || t('contact', locale)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity.contact && (
                <div
                  className="flex items-start gap-3 cursor-pointer hover:bg-muted/30 -m-2 p-2 rounded-lg transition-colors"
                  onClick={() => navigate(`/contacts/${activity.contact?.id}`)}
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {activity.contact.fullname}
                      </p>
                      <ArrowRight className="w-3.5 h-3.5 text-accent-foreground flex-shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('contact', locale)}
                    </p>
                  </div>
                </div>
              )}

              {/* Divider */}
              {(activity.contact || (activity.contacts && activity.contacts.length > 0)) && activity.opportunity && (
                <div className="border-t border-border/50 my-3" />
              )}

              {/* Opportunity Section */}
              {activity.opportunity && (
                <div
                  className="flex items-start gap-3 cursor-pointer hover:bg-muted/30 -m-2 p-2 rounded-lg transition-colors"
                  onClick={() => navigate(`/opportunities/${activity.opportunity?.id}`)}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#6366F1]/10 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {activity.opportunity.name1}
                      </p>
                      <ArrowRight className="w-3.5 h-3.5 text-[#6366F1] flex-shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {fullOpportunity && (
                        <>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                            {fullOpportunity.stage}
                          </Badge>
                          <span className="font-medium text-foreground">
                            ${(fullOpportunity.totalamount || 0).toLocaleString()}
                          </span>
                          {fullOpportunity.confidence !== undefined && (
                            <span className={cn(
                              'font-medium',
                              fullOpportunity.confidence >= 70 ? 'text-green-600 dark:text-green-400' :
                              fullOpportunity.confidence >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            )}>
                              {fullOpportunity.confidence}%
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {fullOpportunity?.expectedclosedate && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {t('expectedCloseColon', locale)}
                          {new Date(fullOpportunity.expectedclosedate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>
          )}

          {/* Details — notes (merged into the activity card) */}
          {activity.notes && (
            <div className="space-y-2 pt-3 border-t border-border/40">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('details', locale)}
              </h2>

            {/* Notes */}
            {activity.notes && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{t('notes', locale)}</p>
                </div>
                {/<html[\s>]/i.test(activity.notes) ? (
                  <iframe
                    srcDoc={activity.notes}
                    sandbox="allow-same-origin"
                    scrolling="no"
                    className="w-full border-0 pl-6"
                    style={{ minHeight: 120, overflow: 'hidden' }}
                    onLoad={(e) => {
                      const iframe = e.target as HTMLIFrameElement;
                      try {
                        const h = iframe.contentDocument?.documentElement?.scrollHeight;
                        if (h) iframe.style.height = `${h}px`;
                      } catch { /* cross-origin fallback */ }
                    }}
                  />
                ) : (
                  <p className="text-sm text-foreground leading-relaxed pl-6">
                    {activity.notes}
                  </p>
                )}
              </div>
            )}
            </div>
          )}

          {/* Attachments — merged into the activity card */}
          {savedAttachments.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border/40">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('attachmentsCount', locale, { count: savedAttachments.length })}
              </h2>
            <div className="flex gap-2 flex-wrap">
              {savedAttachments.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => {
                    if (att.type === 'image') {
                      setLightboxAttachment(att.dataUrl);
                    } else {
                      const w = window.open();
                      if (w) w.document.write(`<iframe src="${att.dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>`);
                    }
                  }}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/50 bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  title={att.name}
                  aria-label={att.name}
                >
                  {att.type === 'image' ? (
                    <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center px-1">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[8px] text-muted-foreground mt-1 truncate max-w-full">
                        {att.name.length > 10 ? att.name.slice(0, 10) + '…' : att.name}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
            </div>
          )}

          {/* Empty fallback — only when the card has no related context, notes or attachments */}
          {!activity.account && !activity.contact && !(activity.contacts && activity.contacts.length > 0) && !activity.opportunity && !activity.notes && savedAttachments.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('noNotesOrAttachments', locale)}
            </p>
          )}
        </GlassCard>

        {/* AI Insight — narrative + structured, explained next actions (closed loop) */}
        {businessSettings.aiSummaryEnabled && (
        <AISummaryCard
          summary={aiSummary}
          isLoading={isLoadingAISummary}
          isGenerating={isGenerating}
          isExpired={isExpired}
          isFailed={isFailed}
          isRefreshing={isRefreshingAI || isTriggering}
          onRefresh={handleRefreshAISummary}
          entityId={activity.id}
          onCreateTask={handleCreateInsightTask}
        />
        )}

        {/* Metadata */}
        {activity.createdon && (
          <div className="text-xs text-muted-foreground text-center">
            <p>Created: {formatDateTime(activity.createdon)}</p>
          </div>
        )}
        </motion.div>
      </PullToRefresh>

      {/* Client Profile Sheet */}
      {activity.account && (
        <ClientProfileSheet
          accountId={activity.account.id}
          open={profileSheetOpen}
          onOpenChange={setProfileSheetOpen}
        />
      )}

      {/* Attachment lightbox */}
      {lightboxAttachment && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxAttachment(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={lightboxAttachment}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </MobileLayout>
  );
}
