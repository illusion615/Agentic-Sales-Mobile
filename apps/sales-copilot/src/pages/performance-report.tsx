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
import type { Opportunity } from '@/generated/models/opportunity-model';import type { Activity } from '@/generated/models/activity-model';import type { Account } from '@/generated/models/account-model';import { getLocale, t } from '@/lib/i18n';
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

function formatCurrency(value: number): string {
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
  const firstMount = useFirstMount('performance-report');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: opportunities = [] } = useOpportunityList();
  const { data: activities = [] } = useActivityList();
  const { data: accounts = [] } = useAccountList();

  // Calculate performance metrics
  const wonDeals = opportunities.filter(
    (opp: Opportunity) => opp.stage === 'won'
  );
  const lostDeals = opportunities.filter(
    (opp: Opportunity) => opp.stage === 'lost'
  );
  const activeDeals = opportunities.filter(
    (opp: Opportunity) => !['won', 'lost'].includes(opp.stage)
  );

  const totalWonValue = wonDeals.reduce((sum: number, opp: Opportunity) => sum + (opp.amountBase ?? opp.totalamount ?? 0), 0);
  const totalPipelineValue = activeDeals.reduce((sum: number, opp: Opportunity) => sum + (opp.amountBase ?? opp.totalamount ?? 0), 0);
  const winRate = wonDeals.length + lostDeals.length > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0;

  // Simulated targets (would come from settings/backend in real app)
  const monthlyTarget = 1500000; // $1.5M
  const activityTarget = 20;
  const performancePercent = Math.round((totalWonValue / monthlyTarget) * 100);
  const activityPercent = Math.round((activities.length / activityTarget) * 100);

  // Activity breakdown
  const activityByType: Record<string, number> = {};
  activities.forEach((act: Activity) => {
    const type = act.type || 'other';
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
            {t('back', locale)}
          </button>
          <h1 className="text-base font-semibold text-foreground">
            {t('performanceReport', locale)}
          </h1>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial={firstMount ? 'hidden' : false}
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
                {t('thisMonth', locale)}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('targetColon', locale)}
                {formatCurrency(monthlyTarget)}
              </p>
            </div>
            <ProgressRing progress={performancePercent} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-3" style={{ borderRadius: 12 }}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">
                  {t('achieved', locale)}
                </span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(totalWonValue)}
              </p>
            </div>
            <div className="glass-card p-3" style={{ borderRadius: 12 }}>
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">
                  {t('inPipeline', locale)}
                </span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(totalPipelineValue)}
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
              {t('won', locale)}
            </p>
          </div>
          <div className="glass-card p-3 text-center" style={{ borderRadius: 14 }}>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {lostDeals.length}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t('lost', locale)}
            </p>
          </div>
          <div className="glass-card p-3 text-center" style={{ borderRadius: 14 }}>
            <p className="text-2xl font-bold text-foreground">{winRate}%</p>
            <p className="text-[10px] text-muted-foreground">
              {t('winRate', locale)}
            </p>
          </div>
          <div className="glass-card p-3 text-center" style={{ borderRadius: 14 }}>
            <p className="text-2xl font-bold text-foreground">{activeDeals.length}</p>
            <p className="text-[10px] text-muted-foreground">
              {t('active', locale)}
            </p>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={itemVariants} className="mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-3 bg-muted/50">
              <TabsTrigger value="overview">
                {t('overview', locale)}
              </TabsTrigger>
              <TabsTrigger value="deals">
                {t('deals', locale)}
              </TabsTrigger>
              <TabsTrigger value="activity">
                {t('activityTab', locale)}
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Activity Progress */}
              <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-violet-500" />
                    {t('activityProgress', locale)}
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
                    ? t('targetAchieved', locale)
                    : activityPercent >= 70
                    ? t('almostThere', locale)
                    : t('moreActivitiesNeeded', locale)}
                </p>
              </div>

              {/* Client Coverage */}
              <div className="glass-card p-4" style={{ borderRadius: 16 }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    {t('clientCoverage', locale)}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{accounts.length}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('totalClients', locale)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {opportunities.length > 0 ? Math.round((wonDeals.length / opportunities.length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('conversion', locale)}
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
                    {t('noDealData', locale)}
                  </p>
                </div>
              ) : (
                <>
                  {/* Won deals */}
                  {wonDeals.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {t('wonClosed', locale)} ({wonDeals.length})
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
                              {formatCurrency(opp.totalamount)}
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
                        {t('active', locale)} ({activeDeals.length})
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
                                {opp.stage} • {opp.confidence || 0}%
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-foreground ml-2">
                              {formatCurrency(opp.totalamount)}
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
                  {t('activitySummary', locale)}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('totalActivities', locale)}
                    </span>
                    <span className="font-medium text-foreground">{activities.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('weeklyTarget', locale)}
                    </span>
                    <span className="font-medium text-foreground">{activityTarget}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('completion', locale)}
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
                {t('logNewActivity', locale)}
              </Button>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>
    </div>
  );
}
