import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  Target,
  DollarSign,
  Users,
  Calendar,
  Zap,
  Award,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useActivityList } from '@/generated/hooks/use-activity';
import { useAccountList } from '@/generated/hooks/use-account';
import { OpportunityStagekeyToLabel } from '@/generated/models/opportunity-model';
import type { Opportunity, OpportunityStagekey } from '@/generated/models/opportunity-model';
import type { Activity } from '@/generated/models/activity-model';
import type { Account } from '@/generated/models/account-model';
import { getLocale } from '@/lib/i18n';

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

function formatCurrency(value: number, locale: string): string {
  if (locale === 'zh-Hans') {
    if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
    return `¥${value.toLocaleString()}`;
  }
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function ProgressRing({ progress, size = 80, strokeWidth = 6 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(progress, 100) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            progress >= 100 ? 'text-emerald-500' :
            progress >= 70 ? 'text-amber-500' :
            'text-rose-500'
          )}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn(
          'text-lg font-bold',
          progress >= 100 ? 'text-emerald-600 dark:text-emerald-400' :
          progress >= 70 ? 'text-amber-600 dark:text-amber-400' :
          'text-rose-600 dark:text-rose-400'
        )}>
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

export default function PerformanceReportPage() {
  const navigate = useNavigate();
  const locale = getLocale();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: opportunities = [] } = useOpportunityList();
  const { data: activities = [] } = useActivityList();
  const { data: accounts = [] } = useAccountList();

  // Calculate performance metrics
  const wonDeals = opportunities.filter(
    (opp: Opportunity) => OpportunityStagekeyToLabel[opp.stageKey] === 'won'
  );
  const lostDeals = opportunities.filter(
    (opp: Opportunity) => OpportunityStagekeyToLabel[opp.stageKey] === 'lost'
  );
  const activeDeals = opportunities.filter(
    (opp: Opportunity) => !['won', 'lost'].includes(OpportunityStagekeyToLabel[opp.stageKey])
  );

  const totalWonValue = wonDeals.reduce((sum: number, opp: Opportunity) => sum + (opp.totalamount || 0), 0);
  const totalPipelineValue = activeDeals.reduce((sum: number, opp: Opportunity) => sum + (opp.totalamount || 0), 0);
  const winRate = wonDeals.length + lostDeals.length > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0;

  // Simulated targets (would come from settings/backend in real app)
  const monthlyTarget = 1500000; // ¥150万
  const activityTarget = 20;
  const performancePercent = Math.round((totalWonValue / monthlyTarget) * 100);
  const activityPercent = Math.round((activities.length / activityTarget) * 100);

  // Activity breakdown
  const activityByType: Record<string, number> = {};
  activities.forEach((act: Activity) => {
    const type = act.typeKey || 'other';
    activityByType[type] = (activityByType[type] || 0) + 1;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            {locale === 'zh-Hans' ? '返回' : 'Back'}
          </button>
          <h1 className="text-base font-semibold text-foreground">
            {locale === 'zh-Hans' ? '业绩报表' : 'Performance Report'}
          </h1>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="px-4 pb-8"
      >
        {/* Performance Overview Card */}
        <motion.div
          variants={itemVariants}
          className="glass-card p-5 mt-4 -mx-4 md:mx-0"
          style={{ borderRadius: 20 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {locale === 'zh-Hans' ? '本月业绩' : 'This Month'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {locale === 'zh-Hans' ? '目标: ' : 'Target: '}
                {formatCurrency(monthlyTarget, locale)}
              </p>
            </div>
            <ProgressRing progress={performancePercent} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-3" style={{ borderRadius: 12 }}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">
                  {locale === 'zh-Hans' ? '已完成' : 'Achieved'}
                </span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(totalWonValue, locale)}
              </p>
            </div>
            <div className="glass-card p-3" style={{ borderRadius: 12 }}>
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">
                  {locale === 'zh-Hans' ? '管道中' : 'In Pipeline'}
                </span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(totalPipelineValue, locale)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-2 mt-4">
          <div className="glass-card p-3 text-center" style={{ borderRadius: 14 }}>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {wonDeals.length}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {locale === 'zh-Hans' ? '成交' : 'Won'}
            </p>
          </div>
          <div className="glass-card p-3 text-center" style={{ borderRadius: 14 }}>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {lostDeals.length}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {locale === 'zh-Hans' ? '流失' : 'Lost'}
            </p>
          </div>
          <div className="glass-card p-3 text-center" style={{ borderRadius: 14 }}>
            <p className="text-2xl font-bold text-foreground">{winRate}%</p>
            <p className="text-[10px] text-muted-foreground">
              {locale === 'zh-Hans' ? '胜率' : 'Win Rate'}
            </p>
          </div>
          <div className="glass-card p-3 text-center" style={{ borderRadius: 14 }}>
            <p className="text-2xl font-bold text-foreground">{activeDeals.length}</p>
            <p className="text-[10px] text-muted-foreground">
              {locale === 'zh-Hans' ? '进行中' : 'Active'}
            </p>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={itemVariants} className="mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-3 bg-muted/50">
              <TabsTrigger value="overview">
                {locale === 'zh-Hans' ? '概览' : 'Overview'}
              </TabsTrigger>
              <TabsTrigger value="deals">
                {locale === 'zh-Hans' ? '商机' : 'Deals'}
              </TabsTrigger>
              <TabsTrigger value="activity">
                {locale === 'zh-Hans' ? '活动' : 'Activity'}
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Activity Progress */}
              <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-violet-500" />
                    {locale === 'zh-Hans' ? '活动完成度' : 'Activity Progress'}
                  </h3>
                  <Badge variant="outline">
                    {activities.length}/{activityTarget}
                  </Badge>
                </div>
                <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      activityPercent >= 100 ? 'bg-emerald-500' :
                      activityPercent >= 70 ? 'bg-amber-500' :
                      'bg-violet-500'
                    )}
                    style={{ width: `${Math.min(activityPercent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {activityPercent >= 100
                    ? (locale === 'zh-Hans' ? '🎉 目标达成!' : '🎉 Target achieved!')
                    : activityPercent >= 70
                    ? (locale === 'zh-Hans' ? '接近目标，继续加油!' : 'Almost there, keep going!')
                    : (locale === 'zh-Hans' ? '需要更多活动来达成目标' : 'More activities needed to reach target')}
                </p>
              </div>

              {/* Client Coverage */}
              <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    {locale === 'zh-Hans' ? '客户覆盖' : 'Client Coverage'}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{accounts.length}</p>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'zh-Hans' ? '总客户数' : 'Total Clients'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {opportunities.length > 0 ? Math.round((wonDeals.length / opportunities.length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'zh-Hans' ? '转化率' : 'Conversion'}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Deals Tab */}
            <TabsContent value="deals" className="mt-4 space-y-3">
              {opportunities.length === 0 ? (
                <div className="text-center py-8">
                  <Target className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-muted-foreground text-sm">
                    {locale === 'zh-Hans' ? '暂无商机数据' : 'No deal data'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Won deals */}
                  {wonDeals.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {locale === 'zh-Hans' ? '已成交' : 'Won'} ({wonDeals.length})
                      </h4>
                      {wonDeals.slice(0, 3).map((opp: Opportunity) => (
                        <div
                          key={opp.id}
                          className="glass-card p-3 mb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                          style={{ borderRadius: 12 }}
                          onClick={() => navigate(`/opportunities/${opp.id}`)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground truncate flex-1">
                              {opp.name1}
                            </span>
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 ml-2">
                              {formatCurrency(opp.totalamount, locale)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Active deals */}
                  {activeDeals.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {locale === 'zh-Hans' ? '进行中' : 'Active'} ({activeDeals.length})
                      </h4>
                      {activeDeals.slice(0, 3).map((opp: Opportunity) => (
                        <div
                          key={opp.id}
                          className="glass-card p-3 mb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                          style={{ borderRadius: 12 }}
                          onClick={() => navigate(`/opportunities/${opp.id}`)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-foreground truncate block">
                                {opp.name1}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {OpportunityStagekeyToLabel[opp.stageKey]} • {opp.confidence || 0}%
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-foreground ml-2">
                              {formatCurrency(opp.totalamount, locale)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4 space-y-4">
              <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                <h3 className="text-sm font-medium text-foreground mb-3">
                  {locale === 'zh-Hans' ? '活动统计' : 'Activity Summary'}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {locale === 'zh-Hans' ? '总活动数' : 'Total Activities'}
                    </span>
                    <span className="font-medium text-foreground">{activities.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {locale === 'zh-Hans' ? '本周目标' : 'Weekly Target'}
                    </span>
                    <span className="font-medium text-foreground">{activityTarget}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {locale === 'zh-Hans' ? '完成率' : 'Completion'}
                    </span>
                    <span className={cn(
                      'font-medium',
                      activityPercent >= 100 ? 'text-emerald-600 dark:text-emerald-400' :
                      activityPercent >= 70 ? 'text-amber-600 dark:text-amber-400' :
                      'text-rose-600 dark:text-rose-400'
                    )}>
                      {activityPercent}%
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => navigate('/activity-capture')}
              >
                <Zap className="w-4 h-4" />
                {locale === 'zh-Hans' ? '记录新活动' : 'Log New Activity'}
              </Button>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>
    </div>
  );
}
