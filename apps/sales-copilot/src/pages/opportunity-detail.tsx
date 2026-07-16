import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Target,
  Building2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  Plus,
  Trash2,
  Loader2,
  MapPin,
  Phone,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityStatusBadge } from '@/components/activity-status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
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
import { MobileLayout } from '@/components/mobile-layout';
import { AISummaryCard } from '@/components/ai-summary-card';
import { useOpportunity, useDeleteOpportunity } from '@/generated/hooks/use-opportunity';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/generated/hooks/use-account';
import { useActivityList } from '@/generated/hooks/use-activity';
import { useEntityAISummary, useWithAISummaryTrigger } from '@/hooks/use-ai-summary-trigger';
import { useAiInsightSettings } from '@/hooks/use-ai-insight-settings';
import {  } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';import { toast } from '@/lib/toast-utils';
import { getLocale, t } from '@/lib/i18n';
import { FloatingQuickActions } from '@/components/floating-quick-actions';
import { useCopilot } from '@/contexts/copilot-context';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { useFirstMount } from '@/hooks/use-first-mount';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'];

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function getStageIndex(stage: string): number {
  const label = stage;
  return stages.indexOf(label);
}

function getTrendIcon(trendKey?: string) {
  if (!trendKey) return null;
  const label = trendKey;
  if (label === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (label === 'down') return <TrendingDown className="w-4 h-4 text-rose-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function getActivityTypeIcon(type: string | null | undefined): React.ComponentType<{ className?: string }> {
  switch (type) {
    case 'visit': return Calendar; // visit
    case 'call': return Phone; // call
    case 'meeting': return Calendar; // meeting
    case 'email': return Mail; // email
    default: return CheckSquare;
  }
}

function StageProgress({ stage, confidence }: { stage: string; confidence?: number }) {
  const currentIndex = getStageIndex(stage);
  const stageLabel = stage;
  const isClosed = stageLabel === 'won' || stageLabel === 'lost';

  const displayStages = stages.slice(0, 4); // Only show active stages

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {displayStages.map((stage: string, idx: number) => (
          <div
            key={stage}
            className={cn(
              'h-2 flex-1 rounded-full transition-colors',
              idx <= currentIndex && !isClosed
                ? confidence && confidence >= 70
                  ? 'bg-emerald-500'
                  : confidence && confidence >= 40
                  ? 'bg-amber-500'
                  : 'bg-primary'
                : isClosed && stageLabel === 'won'
                ? 'bg-emerald-500'
                : isClosed && stageLabel === 'lost'
                ? 'bg-rose-300'
                : 'bg-muted'
            )}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {displayStages.map((stage: string) => (
          <span key={stage} className="capitalize truncate">
            {stage}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const firstMount = useFirstMount(`opportunity-detail:${id ?? ''}`);
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const locale = getLocale();

  // Fetch data from Dataverse
  const { data: opportunity, isLoading, error } = useOpportunity(id || '');
  const { data: account } = useAccount(opportunity?.account?.id || '');
  const { data: allActivities = [] } = useActivityList();

  // Prefetch related entity detail chunks (account, activity)
  useEffect(() => {
    import('@/lib/prefetch').then(({ prefetchRelated }) => prefetchRelated('opportunity'));
  }, []);
  const deleteOpportunity = useDeleteOpportunity();
  const queryClient = useQueryClient();

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['opportunity', id] }),
      queryClient.invalidateQueries({ queryKey: ['activity-list'] }),
    ]);
  }, [queryClient, id]);

  // AI Summary hooks
  const { summary: aiSummary, isLoading: isLoadingAISummary, isGenerating, isExpired, isFailed, localeMismatch, refetch: refetchAISummary } = useEntityAISummary('opportunity', id || '');
  const { triggerForEntity, isTriggering } = useWithAISummaryTrigger();
  const { showInsights, autoGenerate } = useAiInsightSettings();

  // Filter activities for this opportunity
  const activities = useMemo(() => 
    allActivities.filter((a: Activity) => a.opportunity?.id === id), [allActivities, id]);

  // Local state for immediate refresh feedback
  const [isRefreshingAI, setIsRefreshingAI] = useState(false);

  const handleRefreshAISummary = useCallback(() => {
    if (!opportunity) return;
    setIsRefreshingAI(true);
    triggerForEntity('opportunity', opportunity.id, JSON.parse(JSON.stringify(opportunity)), {
      account: account ? { id: account.id, name: account.name1 } : undefined,
      activities: activities.map((a: Activity) => ({ id: a.id, title: a.title, type: a.type, date: a.scheduleddate })),
    });
    setTimeout(() => {
      refetchAISummary();
      setIsRefreshingAI(false);
    }, 500);
  }, [opportunity, account, activities, triggerForEntity, refetchAISummary]);

  // Regenerate the insight when the user switched language since it was generated.
  useEffect(() => {
    if (localeMismatch && opportunity && !isGenerating && !isTriggering && !isRefreshingAI) {
      handleRefreshAISummary();
    }
  }, [localeMismatch, opportunity, isGenerating, isTriggering, isRefreshingAI, handleRefreshAISummary]);

  // Auto-generate the insight on open when the user opted into auto-generation
  // and this record has none yet (settings → AI assistant). One shot per record.
  const autoGenForIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showInsights || !autoGenerate || !opportunity) return;
    if (aiSummary || isLoadingAISummary || isGenerating || isTriggering || isRefreshingAI) return;
    if (autoGenForIdRef.current === opportunity.id) return;
    autoGenForIdRef.current = opportunity.id;
    handleRefreshAISummary();
  }, [showInsights, autoGenerate, opportunity, aiSummary, isLoadingAISummary, isGenerating, isTriggering, isRefreshingAI, handleRefreshAISummary]);

  // Calculate days until close
  const daysUntilClose = opportunity?.expectedclosedate
    ? Math.ceil(
        (new Date(opportunity.expectedclosedate).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteOpportunity.mutateAsync(id);
      // Returning to the list (item now gone) is the feedback; no toast.
      navigate('/opportunity-review');
    } catch (error: unknown) {
      // Toast is shown by the global MutationCache.onError handler.
      console.error('Failed to delete opportunity:', error);
      setIsDeleting(false);
    }
  };

  const stageLabel = opportunity ? opportunity.stage : '';
  const isClosed = stageLabel === 'won' || stageLabel === 'lost';

  // Copilot context for agent awareness
  const copilot = useCopilot();

  // Set page context for Copilot agent awareness
  useEffect(() => {
    if (!opportunity) return;
    
    const stageDisplayLabel = opportunity.stage;
    
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '商机详情' : 'Opportunity Detail',
      summary: locale === 'zh-Hans'
        ? `查看商机: ${opportunity.name1}，客户: ${account?.name1 || '未知'}，金额: ${formatCurrency(opportunity.totalamount || 0)}，阶段: ${stageDisplayLabel}，信心度: ${opportunity.confidence || 0}%`
        : `Viewing opportunity: ${opportunity.name1}, Account: ${account?.name1 || 'Unknown'}, Amount: ${formatCurrency(opportunity.totalamount || 0)}, Stage: ${stageDisplayLabel}, Confidence: ${opportunity.confidence || 0}%`,
      pageData: {
        opportunityId: opportunity.id,
        opportunityName: opportunity.name1,
        accountId: opportunity.account?.id,
        accountName: account?.name1,
        totalAmount: opportunity.totalamount,
        stage: stageDisplayLabel,
        confidence: opportunity.confidence,
        confidenceTrend: opportunity.confidenceTrend,
        expectedCloseDate: opportunity.expectedclosedate,
        daysUntilClose,
        activitiesCount: activities.length,
        lastAction: opportunity.lastaction,
        blocker: opportunity.blocker,
        isClosed,
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [opportunity, account, activities.length, daysUntilClose, isClosed, locale, copilot.setPageContext]);

  // Delete button for header
  const deleteButton = (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="w-5 h-5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('deleteOpportunityTitle', locale)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteOpportunityDesc', locale)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel', locale)}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('deleting', locale)}
              </>
            ) : (
              t('delete', locale)
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isLoading) {
    return (
      <MobileLayout title={t('opportunityDetails', locale)} showBack>
        <div className="px-4 pb-40 space-y-4 mt-4">
          {/* Header card skeleton */}
          <div className="glass-card p-4 animate-pulse" style={{ borderRadius: 20 }}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted/50" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-3/4 rounded bg-muted/50" />
                <div className="h-4 w-1/2 rounded bg-muted/40" />
                <div className="flex gap-2"><div className="h-5 w-16 rounded-full bg-muted/40" /><div className="h-5 w-14 rounded-full bg-muted/40" /></div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
              <div className="flex gap-1">{[0,1,2,3].map(i => <div key={i} className="h-2 flex-1 rounded-full bg-muted/40" />)}</div>
            </div>
          </div>
          {/* Detail rows skeleton */}
          <div className="glass-card p-4 animate-pulse space-y-3" style={{ borderRadius: 20 }}>
            {[0,1,2,3].map(i => <div key={i} className="flex justify-between"><div className="h-4 w-24 rounded bg-muted/40" /><div className="h-4 w-32 rounded bg-muted/50" /></div>)}
          </div>
          {/* AI Summary skeleton */}
          <div className="glass-card p-4 animate-pulse space-y-2" style={{ borderRadius: 20 }}>
            <div className="h-5 w-28 rounded bg-muted/50" />
            <div className="h-3 w-full rounded bg-muted/40" />
            <div className="h-3 w-5/6 rounded bg-muted/40" />
            <div className="h-3 w-2/3 rounded bg-muted/40" />
          </div>
        </div>
      </MobileLayout>
    );
  }

  if (error || !opportunity) {
    return (
      <MobileLayout title={t('opportunity', locale)} showBack>
        <Empty className="py-20">
          <EmptyHeader>
            <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
            <EmptyTitle>
              {t('opportunityNotFound', locale)}
            </EmptyTitle>
            <EmptyDescription>
              {t('recordMayBeDeleted', locale)}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/opportunity-review')}>
            {t('backToList', locale)}
          </Button>
        </Empty>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout
      title={opportunity.name1 || t('opportunityDetails', locale)}
      showBack
      headerRight={deleteButton}
    >
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto">
        <motion.div
          variants={containerVariants}
          initial={firstMount ? 'hidden' : false}
          animate="show"
          className="px-4 pb-40"
        >
        {/* Opportunity Header Card */}
        <motion.div
          variants={itemVariants}
          className="glass-card p-4 mt-4"
          style={{ borderRadius: 20 }}
        >
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0',
                stageLabel === 'won'
                  ? 'bg-emerald-500/20'
                  : stageLabel === 'lost'
                  ? 'bg-rose-500/20'
                  : 'bg-primary/20'
              )}
            >
              {stageLabel === 'won' ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              ) : stageLabel === 'lost' ? (
                <AlertTriangle className="w-7 h-7 text-rose-500" />
              ) : (
                <Target className="w-7 h-7 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground mb-1">{opportunity.name1}</h1>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span
                  className="text-sm text-primary cursor-pointer hover:underline"
                  onClick={() => navigate(`/accounts/${opportunity.account?.id}`)}
                >
                  {account?.name1 || 'Unknown Account'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    stageLabel === 'won' && 'bg-emerald-500/20 text-emerald-600',
                    stageLabel === 'lost' && 'bg-rose-500/20 text-rose-600'
                  )}
                >
                  {stageLabel.charAt(0).toUpperCase() + stageLabel.slice(1)}
                </Badge>
                {opportunity.confidence && (
                  <Badge variant="outline" className="gap-1">
                    {getTrendIcon(opportunity.confidenceTrend)}
                    {opportunity.confidence}%
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Stage Progress */}
          {!isClosed && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <StageProgress stage={opportunity.stage} confidence={opportunity.confidence} />
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/50">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(opportunity.amountBase ?? opportunity.totalamount ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('amount', locale)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {opportunity.confidence || '-'}%
              </p>
              <p className="text-xs text-muted-foreground">
                {t('confidence', locale)}
              </p>
            </div>
            <div className="text-center">
              <p
                className={cn(
                  'text-lg font-bold',
                  daysUntilClose !== null && daysUntilClose < 0
                    ? 'text-rose-600'
                    : daysUntilClose !== null && daysUntilClose <= 7
                    ? 'text-amber-600'
                    : 'text-foreground'
                )}
              >
                {daysUntilClose !== null ? `${daysUntilClose}d` : '-'}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('toClose', locale)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={itemVariants} className="mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-3 bg-muted/50">
              <TabsTrigger value="overview">
                {t('overview', locale)}
              </TabsTrigger>
              <TabsTrigger value="timeline">
                {t('timeline', locale)} ({activities.length})
              </TabsTrigger>
              <TabsTrigger value="notes">
                {t('notes', locale)}
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* AI Insights */}
              {showInsights && (
              <AISummaryCard
                summary={aiSummary}
                isLoading={isLoadingAISummary}
                isGenerating={isGenerating}
                isExpired={isExpired}
                isFailed={isFailed}
                isRefreshing={isRefreshingAI || isTriggering}
                onRefresh={handleRefreshAISummary}
              />
              )}

              {/* Key Dates */}
              <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                <h3 className="text-sm font-medium text-foreground mb-3">
                  {t('keyDates', locale)}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {t('created', locale)}
                    </span>
                    <span className="text-foreground">{formatDate(opportunity.createdon)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      {t('expectedClose', locale)}
                    </span>
                    <span
                      className={cn(
                        'font-medium',
                        daysUntilClose !== null && daysUntilClose < 0 && 'text-rose-600'
                      )}
                    >
                      {formatDate(opportunity.expectedclosedate)}
                    </span>
                  </div>
                  {(opportunity.closedon || opportunity.stage === 'won' || opportunity.stage === 'lost') && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {t('closedOn', locale)}
                      </span>
                      <span className="text-foreground">{formatDate(opportunity.closedon)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Last Action */}
              {opportunity.lastaction && (
                <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {t('lastAction', locale)}
                  </h3>
                  <p className="text-sm text-muted-foreground">{opportunity.lastaction}</p>
                </div>
              )}

              {/* Blocker */}
              {opportunity.blocker && (
                <div className="glass-card p-4 border-amber-500/30" style={{ borderRadius: 16 }}>
                  <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {t('blocker', locale)}
                  </h3>
                  <p className="text-sm text-muted-foreground">{opportunity.blocker}</p>
                </div>
              )}
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="mt-4">
              {activities.length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                    <EmptyTitle>
                      {t('noActivitiesYet', locale)}
                    </EmptyTitle>
                    <EmptyDescription>
                      {t('logActivitiesHint', locale)}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity: Activity) => (
                    <motion.div
                      key={activity.id}
                      variants={itemVariants}
                      className="glass-card p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                      style={{ borderRadius: 14 }}
                      onClick={() => navigate(`/activities/${activity.id}`)}
                    >
                      <div className="flex gap-3">
                        {(() => {
                          const Icon = getActivityTypeIcon(activity.type);
                          return (
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-4 h-4 text-primary" />
                            </div>
                          );
                        })()}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-foreground truncate">
                              {activity.title}
                            </h4>
                            {activity.status && (
                              <ActivityStatusBadge activity={activity} size="sm" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {formatDate(activity.scheduleddate)}
                            {activity.type && ` • ${activity.type}`}
                          </p>
                          {activity.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {activity.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="mt-4">
              <Empty className="py-8">
                <EmptyHeader>
                  <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  <EmptyTitle>
                    {t('noNotesYet', locale)}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t('addNotesHint', locale)}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>
      </PullToRefresh>

      <FloatingQuickActions
        actions={[
          {
            id: 'new-activity',
            icon: Plus,
            label: t('newActivity', locale),
            onClick: () => navigate(`/activity/${opportunity.account?.id || 'new'}`),
          },
        ]}
      />
    </MobileLayout>
  );
}
