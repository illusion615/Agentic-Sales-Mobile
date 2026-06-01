import { useMemo, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard } from '@/components/glass-card';
import { AISummaryCard } from '@/components/ai-summary-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useActivity, useUpdateActivity, useDeleteActivity } from '@/generated/hooks/use-activity';
import { useQueryClient } from '@tanstack/react-query';
import { useContactList } from '@/generated/hooks/use-contact';
import { useAccountList } from '@/generated/hooks/use-account';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import type { Contact } from '@/generated/models/contact-model';import type { Account } from '@/generated/models/account-model';import type { Opportunity, OpportunityStageKeyToLabel as OpportunityStageKeyToLabelType } from '@/generated/models/opportunity-model';import { useEntityAISummary, useWithAISummaryTrigger } from '@/hooks/use-ai-summary-trigger';
import type { Activity as DataverseActivity } from '@/generated/models/activity-model';import { toast } from 'sonner';
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
import { FloatingQuickActions, type QuickAction } from '@/components/floating-quick-actions';
import { getLocale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { PullToRefresh } from '@/components/pull-to-refresh';

const activityIcons: Record<string, typeof Phone> = {
  visit: MapPin,
  call: Phone,
  meeting: Calendar,
  email: Mail,
  other: CheckSquare,
};

const activityColors: Record<string, string> = {
  visit: 'bg-primary',
  call: 'bg-[#0D8F8C]',
  meeting: 'bg-[#6366F1]',
  email: 'bg-[#10B981]',
  other: 'bg-muted-foreground',
};

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
  const { data: activity, isLoading, error: activityError } = useActivity(id ?? '');
  const { data: contacts = [] } = useContactList();
  const { data: accounts = [] } = useAccountList();
  const { data: allOpportunities = [] } = useOpportunityList();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
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
  const { summary: aiSummary, isLoading: isLoadingAISummary, isGenerating, isExpired, isFailed, refetch: refetchAISummary } = useEntityAISummary('activity', id || '');
  const { triggerForEntity, isTriggering } = useWithAISummaryTrigger();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
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
    const statusLabel = activity.draftStatus;
    const outcomeLabel = activity.outcome ? activity.outcome : undefined;
    
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
        outcome: outcomeLabel,
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
      account: activity.account ? { id: activity.account.id, name: activity.account.name1 } : undefined,
      opportunity: activity.opportunity ? { id: activity.opportunity.id, name: activity.opportunity.name1 } : undefined,
    });
    setTimeout(() => {
      refetchAISummary();
      setIsRefreshingAI(false);
    }, 500);
  }, [activity, triggerForEntity, refetchAISummary]);

  const handleMarkComplete = async () => {
    if (!activity) return;
    try {
      await updateActivity.mutateAsync({
        id: activity.id,
        changedFields: {
          draftStatus: 'completed',
        },
      });
      
      // Trigger AI summary generation after completing
      triggerForEntity('activity', activity.id, {
        ...activity,
        draftStatus: 'completed',
      } as Record<string, unknown>, {
        account: activity.account ? { id: activity.account.id, name: activity.account.name1 } : undefined,
        opportunity: activity.opportunity ? { id: activity.opportunity.id, name: activity.opportunity.name1 } : undefined,
      } as Record<string, unknown>);
      
      toast.success('Activity marked as completed');
    } catch (error: unknown) {
      toast.error('Failed to update activity');
    }
  };

  const handleDelete = async () => {
    if (!activity) return;
    try {
      await deleteActivity.mutateAsync(activity.id);
      toast.success('Activity deleted');
      navigate('/activities');
    } catch (error: unknown) {
      toast.error('Failed to delete activity');
    }
  };

  if (isLoading) {
    return (
      <MobileLayout title={locale === 'zh-Hans' ? '活动详情' : 'Activity Details'}>
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
  const statusLabel = activity.draftStatus;
  const isCompleted = statusLabel === 'completed';
  const outcomeLabel = activity.outcome ? activity.outcome : undefined;

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

  return (
    <MobileLayout title="Activity Details" hideVoiceButton headerRight={deleteButton}>
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
              <h1 className="text-lg font-semibold text-foreground mb-1">
                {activity.title}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={isCompleted ? 'secondary' : 'default'}
                  className="capitalize"
                >
                  {statusLabel}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {typeLabel}
                </Badge>
              </div>
            </div>
          </div>

          {/* Date & Time */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {formatDate(activity.scheduleddate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTime(activity.scheduleddate)}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* AI Insights Card */}
        <AISummaryCard
          summary={aiSummary}
          isLoading={isLoadingAISummary}
          isGenerating={isGenerating}
          isExpired={isExpired}
          isFailed={isFailed}
          isRefreshing={isRefreshingAI || isTriggering}
          onRefresh={handleRefreshAISummary}
        />

        {/* Unified Related Context Card - Account, Contact, Opportunity */}
        {(activity.account || activity.opportunity || relatedContacts.length > 0) && (
          <GlassCard className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              {locale === 'zh-Hans' ? '关联上下文' : 'Related Context'}
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
                        <span>{fullAccount.industry}</span>
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
              {activity.account && (relatedContacts.length > 0 || activity.opportunity) && (
                <div className="border-t border-border/50 my-3" />
              )}

              {/* Contacts Row */}
              {relatedContacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {locale === 'zh-Hans' ? '联系人' : 'Contacts'} ({relatedContacts.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {relatedContacts.slice(0, 3).map((contact: Contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20"
                      >
                        <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-accent-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate max-w-[100px]">
                            {contact.fullname}
                          </p>
                          {contact.title && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{contact.title}</p>
                          )}
                        </div>
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="p-1 rounded-full hover:bg-primary/10 transition-colors"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <Phone className="w-3 h-3 text-primary" />
                          </a>
                        )}
                      </div>
                    ))}
                    {relatedContacts.length > 3 && (
                      <div className="flex items-center px-3 py-1.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
                        +{relatedContacts.length - 3} {locale === 'zh-Hans' ? '更多' : 'more'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Divider */}
              {relatedContacts.length > 0 && activity.opportunity && (
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
                          {locale === 'zh-Hans' ? '预计成交: ' : 'Expected close: '}
                          {new Date(fullOpportunity.expectedclosedate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        )}

        {/* Details Card - Outcome and Notes */}
        {(outcomeLabel || activity.notes) && (
          <GlassCard className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              {locale === 'zh-Hans' ? '详情' : 'Details'}
            </h2>

            {/* Outcome */}
            {outcomeLabel && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <CheckCircle className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '结果' : 'Outcome'}</p>
                  <p className="text-sm font-medium text-foreground">
                    {outcomeLabel}
                  </p>
                </div>
              </div>
            )}

            {/* Notes */}
            {activity.notes && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{locale === 'zh-Hans' ? '备注' : 'Notes'}</p>
                </div>
                <p className="text-sm text-foreground leading-relaxed pl-6">
                  {activity.notes}
                </p>
              </div>
            )}
          </GlassCard>
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

      <FloatingQuickActions
        actions={[
          ...(!isCompleted ? [{
            id: 'complete',
            icon: CheckCircle,
            label: locale === 'zh-Hans' ? '完成' : 'Complete',
            onClick: handleMarkComplete,
          }] : []) as QuickAction[],
          {
            id: 'edit',
            icon: Edit,
            label: locale === 'zh-Hans' ? '编辑' : 'Edit',
            onClick: () => navigate(`/activity/${activity.account?.id || 'new'}?edit=${activity.id}`),
          },
        ]}
      />
    </MobileLayout>
  );
}
