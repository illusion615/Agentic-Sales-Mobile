import { useMemo, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Calendar, DollarSign, ChevronRight, TrendingDown, Minus } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { GlassCard, GlassListItem } from '@/components/glass-card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useQueryClient } from '@tanstack/react-query';
import { OpportunityStageKeyToLabel, OpportunityConfidencetrendKeyToLabel } from '@/generated/models/opportunity-model';
import type { Opportunity as DataverseOpportunity, OpportunityConfidencetrendKey } from '@/generated/models/opportunity-model';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useCopilot } from '@/contexts/copilot-context';
import { getLocale } from '@/lib/i18n';
import { PullToRefresh } from '@/components/pull-to-refresh';

const stageColors: Record<string, string> = {
  prospecting: 'bg-[#6366F1]',
  qualification: 'bg-[#0D8F8C]',
  proposal: 'bg-primary',
  negotiation: 'bg-[#F59E0B]',
  won: 'bg-[#10B981]',
  lost: 'bg-muted-foreground',
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
} as const;

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TrendIcon({ trendKey }: { trendKey?: OpportunityConfidencetrendKey }) {
  if (!trendKey) return null;
  const trend = OpportunityConfidencetrendKeyToLabel[trendKey];
  if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === 'down') return <TrendingDown className="w-3 h-3 text-rose-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

export default function OpportunitiesPage() {
  const navigate = useNavigate();

  // Copilot context for agent awareness
  const copilot = useCopilot();
  const locale = getLocale();
  const queryClient = useQueryClient();
  const { data: opportunities = [], isLoading } = useOpportunityList({
    orderBy: ['expectedclosedate asc'],
  });

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['opportunity-list'] });
  }, [queryClient]);

  // Calculate pipeline stats by stage
  const pipelineStats = useMemo(() => {
    const stages = ['prospecting', 'qualification', 'proposal', 'negotiation'];
    return stages.map((stage: string) => {
      const stageOpps = opportunities.filter((opp: DataverseOpportunity) => 
        OpportunityStageKeyToLabel[opp.stageKey] === stage
      );
      const totalValue = stageOpps.reduce((sum: number, opp: DataverseOpportunity) => sum + (opp.totalamount || 0), 0);
      return {
        stage: stage.charAt(0).toUpperCase() + stage.slice(1, 4),
        fullName: stage,
        count: stageOpps.length,
        value: formatCurrency(totalValue),
        color: stageColors[stage] || 'bg-muted',
      };
    });
  }, [opportunities]);

  // Filter to active opportunities (not won/lost)
  const activeOpportunities = useMemo(() => {
    return opportunities.filter((opp: DataverseOpportunity) => {
      const stage = OpportunityStageKeyToLabel[opp.stageKey];
      return stage !== 'won' && stage !== 'lost';
    });
  }, [opportunities]);

  // Calculate total pipeline value for context
  const totalPipelineValue = useMemo(() => {
    return activeOpportunities.reduce((sum: number, opp: DataverseOpportunity) => sum + (opp.totalamount || 0), 0);
  }, [activeOpportunities]);

  // Set page context for Copilot agent awareness
  useEffect(() => {
    copilot.setPageContext({
      currentPage: locale === 'zh-Hans' ? '商机列表' : 'Opportunities List',
      summary: locale === 'zh-Hans'
        ? `商机列表: 共${opportunities.length}个商机，${activeOpportunities.length}个活跃，总管道价值 $${formatCurrency(totalPipelineValue)}`
        : `Opportunities list: ${opportunities.length} total, ${activeOpportunities.length} active, pipeline value ${formatCurrency(totalPipelineValue)}`,
      pageData: {
        totalOpportunities: opportunities.length,
        activeOpportunities: activeOpportunities.length,
        totalPipelineValue,
        pipelineByStage: pipelineStats.map((stat) => ({ stage: stat.fullName, count: stat.count, value: stat.value })),
      },
    });
    
    return () => {
      copilot.setPageContext(null);
    };
  }, [opportunities.length, activeOpportunities.length, totalPipelineValue, pipelineStats, locale, copilot.setPageContext]);

  if (isLoading) {
    return (
      <MobileLayout title="Pipeline">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Pipeline">
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-32">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6 py-4"
        >
          {/* Pipeline Overview */}
          <motion.section variants={itemVariants}>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Pipeline Overview
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {pipelineStats.map((stat, index: number) => (
                <GlassCard key={index} padding="sm" className="text-center">
                  <div
                    className={`w-8 h-8 rounded-lg ${stat.color} mx-auto mb-2 flex items-center justify-center`}
                  >
                    <span className="text-white text-sm font-bold">
                      {stat.count}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stat.stage}
                  </p>
                  <p className="text-sm text-foreground font-medium">
                    {stat.value}
                  </p>
                </GlassCard>
              ))}
            </div>
          </motion.section>

          {/* Opportunity List */}
          <motion.section variants={itemVariants}>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Active Opportunities ({activeOpportunities.length})
            </h2>
            {activeOpportunities.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle>No active opportunities</EmptyTitle>
                  <EmptyDescription>Create a new opportunity to get started</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-3">
                {activeOpportunities.map((opp: DataverseOpportunity) => {
                  const stageLabel = OpportunityStageKeyToLabel[opp.stageKey];
                  
                  return (
                    <motion.div key={opp.id} variants={itemVariants}>
                      <GlassListItem
                        onClick={() => navigate(`/opportunities/${opp.id}`)}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <div className="space-y-2">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-foreground truncate">
                                {opp.name1}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {opp.account?.name1 || 'No account'}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                          </div>

                          {/* Details */}
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1 text-primary font-semibold">
                                <DollarSign className="w-3 h-3" />
                                {formatCurrency(opp.totalamount || 0)}
                              </span>
                              {opp.expectedclosedate && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(opp.expectedclosedate)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {stageLabel}
                              </Badge>
                              {opp.confidence !== undefined && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-white text-[10px] font-medium flex items-center gap-1 ${
                                    opp.confidence >= 70
                                      ? 'bg-[#10B981]'
                                      : opp.confidence >= 40
                                      ? 'bg-primary'
                                      : 'bg-[#6366F1]'
                                  }`}
                                >
                                  <TrendIcon trendKey={opp.confidencetrendKey} />
                                  {opp.confidence}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </GlassListItem>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.section>
        </motion.div>
      </PullToRefresh>
    </MobileLayout>
  );
}
