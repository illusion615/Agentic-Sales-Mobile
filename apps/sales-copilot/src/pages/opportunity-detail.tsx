import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Target,
  Edit,
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
import {
  OpportunityStageKeyToLabel,
  OpportunityConfidencetrendKeyToLabel,
} from '@/generated/models/opportunity-model';
import type { OpportunityStageKey, OpportunityConfidencetrendKey } from '@/generated/models/opportunity-model';
import { ActivityTypeKeyToLabel, ActivityDraftstatusKeyToLabel } from '@/generated/models/activity-model';
import type { Activity, ActivityTypeKey, ActivityDraftstatusKey } from '@/generated/models/activity-model';
import { toast } from 'sonner';
import { getLocale, t } from '@/lib/i18n';
import { FloatingQuickActions } from '@/components/floating-quick-actions';
import { useCopilot } from '@/contexts/copilot-context';
import { PullToRefresh } from '@/components/pull-to-refresh';

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

function getStageIndex(stageKey: OpportunityStageKey): number {
  const label = OpportunityStageKeyToLabel[stageKey];
  return stages.indexOf(label);
}

function getTrendIcon(trendKey?: OpportunityConfidencetrendKey) {
  if (!trendKey) return null;
  const label = OpportunityConfidencetrendKeyToLabel[trendKey];
  if (label === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (label === 'down') return <TrendingDown className="w-4 h-4 text-rose-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function getActivityTypeIcon(typeKey: ActivityTypeKey | null | undefined): React.ComponentType<{ className?: string }> {
  switch (typeKey) {
    case 'TypeKey0': return MapPin; // visit
    case 'TypeKey1': return Phone; // call
    case 'TypeKey2': return Calendar; // meeting
    case 'TypeKey3': return Mail; // email
    default: return CheckSquare;
  }
}

function StageProgress({ stageKey, confidence }: { stageKey: OpportunityStageKey; confidence?: number }) {
  const currentIndex = getStageIndex(stageKey);
  const stageLabel = OpportunityStageKeyToLabel[stageKey];
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
          <span key={stage} className="capitalize">
            {stage.slice(0, 4)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const locale = getLocale();

  // Fetch data from Dataverse
  const { data: opportunity, isLoading, error } = useOpportunity(id || '');
  const { data: account } = useAccount(opportunity?.account?.id || '');
  const { data: allActivities = [] } = useActivityList();
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
  const { summary: aiSummary, isLoading: isLoadingAISummary, isGenerating, isExpired, isFailed, refetch: refetchAISummary } = useEntityAISummary('opportunity', id || '');
  const { triggerForEntity, isTriggering } = useWithAISummaryTrigger();

  // Filter activities for this opportunity
  const activities = useMemo(() => 
    allActivities.filter((a: Activity) => a.opportunity?.id === id), [allActivities, id]);

  // Local state for immediate refresh feedback
  const [isRefreshingAI, setIsRefreshingAI] = useState(false);

  const handleRefreshAISummary = useCallback(() => {
    if (!opportunity) return;
    setIsRefreshingAI(true);
    triggerForEntity('opportunity', opportunity.id, JSON.parse(JSON.stringify(opportunity)), {
      account: account ? { id: account.id, name: account.name1, tier: account.tierKey } : undefined,
      activities: activities.map((a: Activity) => ({ id: a.id, title: a.title, type: a.typeKey, date: a.scheduleddate })),
    });
    setTimeout(() => {
      refetchAISummary();
      setIsRefreshingAI(false);
    }, 500);
  }, [opportunity, account, activities, triggerForEntity, refetchAISummary]);

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
      toast.success(locale === 'zh-Hans' ? '商机已删除' : 'Opportunity deleted');
      navigate('/opportunities');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  const stageLabel = opportunity ? OpportunityStageKeyToLabel[opportunity.stageKey] : '';
  const isClosed = stageLabel === 'won' || stageLabel === 'lost';

  // Copilot context for agent awareness
  const copilot = useCopilot();

  // Set page context for Copilot agent awareness
  useEffect(() => {
    if (!opportunity) return;
    
    const stageDisplayLabel = OpportunityStageKeyToLabel[opportunity.stageKey];
    
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
        confidenceTrend: opportunity.confidencetrendKey,
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
            {locale === 'zh-Hans' ? '确认删除' : 'Delete Opportunity'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {locale === 'zh-Hans'
              ? '此操作无法撤销，确定要删除这个商机吗？'
              : 'This action cannot be undone. Are you sure you want to delete this opportunity?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{locale === 'zh-Hans' ? '取消' : 'Cancel'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {locale === 'zh-Hans' ? '删除中...' : 'Deleting...'}
              </>
            ) : (
              locale === 'zh-Hans' ? '删除' : 'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isLoading) {
    return (
      <MobileLayout title={locale === 'zh-Hans' ? '加载中...' : 'Loading...'} showBack>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">{locale === 'zh-Hans' ? '加载中...' : 'Loading...'}</div>
        </div>
      </MobileLayout>
    );
  }

  if (error || !opportunity) {
    return (
      <MobileLayout title={locale === 'zh-Hans' ? '商机' : 'Opportunity'} showBack>
        <Empty className="py-20">
          <EmptyHeader>
            <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
            <EmptyTitle>
              {locale === 'zh-Hans' ? '商机不存在' : 'Opportunity not found'}
            </EmptyTitle>
            <EmptyDescription>
              {locale === 'zh-Hans' ? '该记录可能已被删除' : 'This record may have been deleted'}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/opportunities')}>
            {locale === 'zh-Hans' ? '返回列表' : 'Back to list'}
          </Button>
        </Empty>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout
      title={opportunity.name1 || (locale === 'zh-Hans' ? '商机详情' : 'Opportunity Details')}
      showBack
      headerRight={deleteButton}
    >
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
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
                    {getTrendIcon(opportunity.confidencetrendKey)}
                    {opportunity.confidence}%
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Stage Progress */}
          {!isClosed && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <StageProgress stageKey={opportunity.stageKey} confidence={opportunity.confidence} />
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/50">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(opportunity.totalamount || 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-Hans' ? '金额' : 'Amount'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {opportunity.confidence || '-'}%
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === 'zh-Hans' ? '信心度' : 'Confidence'}
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
                {locale === 'zh-Hans' ? '距成交' : 'To Close'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={itemVariants} className="mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-3 bg-muted/50">
              <TabsTrigger value="overview">
                {locale === 'zh-Hans' ? '概览' : 'Overview'}
              </TabsTrigger>
              <TabsTrigger value="timeline">
                {locale === 'zh-Hans' ? '时间线' : 'Timeline'} ({activities.length})
              </TabsTrigger>
              <TabsTrigger value="notes">
                {locale === 'zh-Hans' ? '备注' : 'Notes'}
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* AI Insights */}
              <AISummaryCard
                summary={aiSummary}
                isLoading={isLoadingAISummary}
                isGenerating={isGenerating}
                isExpired={isExpired}
                isFailed={isFailed}
                isRefreshing={isRefreshingAI || isTriggering}
                onRefresh={handleRefreshAISummary}
              />

              {/* Key Dates */}
              <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                <h3 className="text-sm font-medium text-foreground mb-3">
                  {locale === 'zh-Hans' ? '关键日期' : 'Key Dates'}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {locale === 'zh-Hans' ? '创建日期' : 'Created'}
                    </span>
                    <span className="text-foreground">{formatDate(opportunity.createdon)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      {locale === 'zh-Hans' ? '预计成交' : 'Expected Close'}
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
                  {opportunity.closedon && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {locale === 'zh-Hans' ? '成交日期' : 'Closed On'}
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
                    {locale === 'zh-Hans' ? '最近动态' : 'Last Action'}
                  </h3>
                  <p className="text-sm text-muted-foreground">{opportunity.lastaction}</p>
                </div>
              )}

              {/* Blocker */}
              {opportunity.blocker && (
                <div className="glass-card p-4 border-amber-500/30" style={{ borderRadius: 16 }}>
                  <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {locale === 'zh-Hans' ? '阻碍因素' : 'Blocker'}
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
                      {locale === 'zh-Hans' ? '暂无活动' : 'No activities yet'}
                    </EmptyTitle>
                    <EmptyDescription>
                      {locale === 'zh-Hans' ? '记录活动以跟踪互动' : 'Log activities to track engagement'}
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
                          const Icon = getActivityTypeIcon(activity.typeKey);
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
                            {activity.draftstatusKey && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  activity.draftstatusKey === 'DraftstatusKey2' && 'text-emerald-600 border-emerald-200'
                                )}
                              >
                                {ActivityDraftstatusKeyToLabel[activity.draftstatusKey as ActivityDraftstatusKey]}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {formatDate(activity.scheduleddate)}
                            {activity.typeKey && ` • ${ActivityTypeKeyToLabel[activity.typeKey as ActivityTypeKey]}`}
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
                    {locale === 'zh-Hans' ? '暂无备注' : 'No notes yet'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {locale === 'zh-Hans' ? '添加备注以记录重要信息' : 'Add notes to track important details'}
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
            label: locale === 'zh-Hans' ? '新建活动' : 'New Activity',
            onClick: () => navigate(`/activity/${opportunity.account?.id || 'new'}`),
          },
          {
            id: 'edit',
            icon: Edit,
            label: locale === 'zh-Hans' ? '编辑' : 'Edit',
            onClick: () => navigate(`/opportunities/${id}/edit`),
          },
        ]}
      />
    </MobileLayout>
  );
}
