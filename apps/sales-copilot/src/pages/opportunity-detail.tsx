import { useState, useMemo } from 'react';
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
  Clock,
  FileText,
  Plus,
  Trash2,
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
import { useOpportunity, useDeleteOpportunity } from '@/generated/hooks/use-opportunity';
import { useAccount } from '@/generated/hooks/use-account';
import { useActivityList } from '@/generated/hooks/use-activity';
import {
  OpportunityStagekeyToLabel,
  OpportunityConfidencetrendkeyToLabel,
} from '@/generated/models/opportunity-model';
import type { OpportunityStagekey, OpportunityConfidencetrendkey } from '@/generated/models/opportunity-model';
import { ActivityTypekeyToLabel, ActivityDraftstatuskeyToLabel } from '@/generated/models/activity-model';
import type { Activity, ActivityTypekey, ActivityDraftstatuskey } from '@/generated/models/activity-model';
import { toast } from 'sonner';
import { getLocale, t } from '@/lib/i18n';

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

function getStageIndex(stageKey: OpportunityStagekey): number {
  const label = OpportunityStagekeyToLabel[stageKey];
  return stages.indexOf(label);
}

function getTrendIcon(trendKey?: OpportunityConfidencetrendkey) {
  if (!trendKey) return null;
  const label = OpportunityConfidencetrendkeyToLabel[trendKey];
  if (label === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (label === 'down') return <TrendingDown className="w-4 h-4 text-rose-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function getActivityTypeIcon(typeKey: ActivityTypekey | null | undefined): string {
  switch (typeKey) {
    case 'Typekey0': return '📍'; // visit
    case 'Typekey1': return '📞'; // call
    case 'Typekey2': return '📅'; // meeting
    case 'Typekey3': return '✉️'; // email
    default: return '📌';
  }
}

function StageProgress({ stageKey, confidence }: { stageKey: OpportunityStagekey; confidence?: number }) {
  const currentIndex = getStageIndex(stageKey);
  const stageLabel = OpportunityStagekeyToLabel[stageKey];
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
  const locale = getLocale();

  // Fetch data from Dataverse
  const { data: opportunity, isLoading } = useOpportunity(id || '');
  const { data: account } = useAccount(opportunity?.account?.id || '');
  const { data: allActivities = [] } = useActivityList();
  const deleteOpportunity = useDeleteOpportunity();

  // Filter activities for this opportunity
  const activities = useMemo(() => 
    allActivities.filter((a: Activity) => a.opportunity?.id === id), [allActivities, id]);

  // Calculate days until close
  const daysUntilClose = opportunity?.expectedclosedate
    ? Math.ceil(
        (new Date(opportunity.expectedclosedate).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteOpportunity.mutateAsync(id);
      toast.success(locale === 'zh-Hans' ? '商机已删除' : 'Opportunity deleted');
      navigate('/opportunities');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    }
  };

  const stageLabel = opportunity ? OpportunityStagekeyToLabel[opportunity.stageKey] : '';
  const isClosed = stageLabel === 'won' || stageLabel === 'lost';

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
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {locale === 'zh-Hans' ? '删除' : 'Delete'}
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

  if (!opportunity) {
    return (
      <MobileLayout title={locale === 'zh-Hans' ? '商机' : 'Opportunity'} showBack>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Target className="w-16 h-16 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {locale === 'zh-Hans' ? '商机不存在' : 'Opportunity not found'}
          </p>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout
      title={opportunity.name1 || (locale === 'zh-Hans' ? '商机详情' : 'Opportunity Details')}
      showBack
      headerRight={deleteButton}
    >
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
                  onClick={() => navigate(`/clients/${opportunity.account?.id}`)}
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
                        <div className="text-xl flex-shrink-0">
                          {getActivityTypeIcon(activity.typeKey)}
                        </div>
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
                                  activity.draftstatusKey === 'Draftstatuskey2' && 'text-emerald-600 border-emerald-200'
                                )}
                              >
                                {ActivityDraftstatuskeyToLabel[activity.draftstatusKey as ActivityDraftstatuskey]}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {formatDate(activity.scheduleddate)}
                            {activity.typeKey && ` • ${ActivityTypekeyToLabel[activity.typeKey as ActivityTypekey]}`}
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

      {/* Quick Actions - positioned above global copilot */}
      <div className="fixed bottom-20 left-0 right-0 z-40 safe-area-bottom pointer-events-none" style={{ background: 'linear-gradient(to top, var(--background) 40%, transparent)' }}>
        <div className="flex items-center justify-center gap-2 px-4 pointer-events-auto">
          <button
            onClick={() => navigate('/activity-capture')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5',
              'rounded-full glass-card-hover',
              'text-xs font-medium text-foreground',
              'active:scale-95 transition-transform'
            )}
          >
            <Plus className="w-4 h-4 text-primary" />
            <span>{locale === 'zh-Hans' ? '新建活动' : 'New Activity'}</span>
          </button>
          <button
            onClick={() => navigate(`/opportunities/${id}/edit`)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5',
              'rounded-full glass-card-hover',
              'text-xs font-medium text-foreground',
              'active:scale-95 transition-transform'
            )}
          >
            <Edit className="w-4 h-4 text-primary" />
            <span>{locale === 'zh-Hans' ? '编辑' : 'Edit'}</span>
          </button>
        </div>
      </div>
    </MobileLayout>
  );
}
