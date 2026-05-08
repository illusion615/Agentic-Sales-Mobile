import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpportunityList } from '@/generated/hooks/use-opportunity';
import { useAccountList } from '@/generated/hooks/use-account';
import { useUser } from '@/hooks/use-user';
import { getLocale, type Locale } from '@/lib/i18n';
import { OpportunityStagekeyToLabel, type OpportunityStagekey } from '@/generated/models/opportunity-model';
import type { Opportunity } from '@/generated/models/opportunity-model';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
} as const;

const stageConfig: Record<string, { zh: string; en: string; color: string }> = {
  prospecting: { zh: '探索', en: 'Prospecting', color: 'bg-blue-500' },
  qualification: { zh: '资质', en: 'Qualification', color: 'bg-cyan-500' },
  proposal: { zh: '方案', en: 'Proposal', color: 'bg-amber-500' },
  negotiation: { zh: '谈判', en: 'Negotiation', color: 'bg-purple-500' },
  won: { zh: '赢单', en: 'Won', color: 'bg-green-500' },
  lost: { zh: '丢单', en: 'Lost', color: 'bg-red-500' },
};

function isClosedStage(stageKey: OpportunityStagekey): boolean {
  const label = OpportunityStagekeyToLabel[stageKey];
  return label === 'won' || label === 'lost';
}

export default function OpportunityReviewPage() {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const { data: user } = useUser();
  const { data: opportunities = [] } = useOpportunityList();
  const { data: accounts = [] } = useAccountList();

  const userId = user?.objectId || 'demo-user-id';
  
  // Demo data for when Dataverse is empty
  const demoOpportunities: Opportunity[] = [
    {
      id: 'demo-opp-1',
      name1: '华北科技 - ERP系统升级',
      account: { id: 'demo-acc-1', name1: '华北科技有限公司' },
      ownerid: userId,
      stageKey: 'negotiation' as OpportunityStagekey,
      confidence: 75,
      totalamount: 280000,
      expectedclosedate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-opp-2',
      name1: '东方集团 - 云服务订阅',
      account: { id: 'demo-acc-2', name1: '东方集团' },
      ownerid: userId,
      stageKey: 'proposal' as OpportunityStagekey,
      confidence: 60,
      totalamount: 156000,
      expectedclosedate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-opp-3',
      name1: '南方制造 - 智能工厂方案',
      account: { id: 'demo-acc-3', name1: '南方制造股份' },
      ownerid: userId,
      stageKey: 'qualification' as OpportunityStagekey,
      confidence: 40,
      totalamount: 520000,
      expectedclosedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'demo-opp-4',
      name1: '西部物流 - 仓储管理系统',
      account: { id: 'demo-acc-4', name1: '西部物流集团' },
      ownerid: userId,
      stageKey: 'prospecting' as OpportunityStagekey,
      confidence: 30,
      totalamount: 98000,
      expectedclosedate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Filter user's active opportunities, fallback to demo data
  const userOpportunities = opportunities.filter(
    (o: Opportunity) => o.ownerid === userId && !isClosedStage(o.stageKey)
  );
  const activeOpps = userOpportunities.length > 0 ? userOpportunities : demoOpportunities;

  const getAccountName = (accountRef: { id: string; name1: string } | undefined) => {
    if (!accountRef) return '';
    return accountRef.name1 || '';
  };

  const formatCurrency = (amount: number) => {
    if (locale === 'zh-Hans') {
      if (amount >= 10000) return `¥${(amount / 10000).toFixed(0)}万`;
      return `¥${amount.toLocaleString()}`;
    }
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const getStageConfig = (stageKey: OpportunityStagekey) => {
    const label = OpportunityStagekeyToLabel[stageKey];
    return stageConfig[label] || stageConfig.prospecting;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
          <h1 className="text-title text-foreground">
            {locale === 'zh-Hans' ? '商机审阅' : 'Opportunity Review'}
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
      <main className="flex-1 pt-14 pb-8 px-4 overflow-y-auto scrollbar-hide">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-3 py-4"
        >
          {/* Summary */}
          <motion.div variants={itemVariants} className="glass-card p-4 flex items-center justify-between">
            <div>
              <p className="text-helper text-muted-foreground">
                {locale === 'zh-Hans' ? '活跃商机' : 'Active Pipeline'}
              </p>
              <p className="text-[1.25rem] font-bold text-foreground">
                {formatCurrency(activeOpps.reduce((sum: number, o: Opportunity) => sum + (o.totalamount || 0), 0))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-helper text-muted-foreground">
                {locale === 'zh-Hans' ? '商机数' : 'Count'}
              </p>
              <p className="text-title text-foreground">{activeOpps.length}</p>
            </div>
          </motion.div>

          {/* Opportunity List */}
          {activeOpps.map((opp: Opportunity) => {
            const stage = getStageConfig(opp.stageKey);
            const isAtRisk = (opp.confidence ?? 100) < 50;

            return (
              <motion.div
                key={opp.id}
                variants={itemVariants}
                className="glass-card p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-body font-medium text-foreground truncate">{opp.name1}</h3>
                    <p className="text-helper text-muted-foreground truncate">
                      {getAccountName(opp.account)}
                    </p>
                  </div>
                  <p className="text-title font-bold text-foreground ml-3">
                    {formatCurrency(opp.totalamount || 0)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium text-white', stage.color)}>
                    {locale === 'zh-Hans' ? stage.zh : stage.en}
                  </span>
                  <span className="text-helper text-muted-foreground">
                    {opp.confidence ?? 0}% {locale === 'zh-Hans' ? '置信度' : 'confidence'}
                  </span>
                  {isAtRisk && (
                    <span className="flex items-center gap-1 text-amber-400 text-helper">
                      <AlertTriangle className="w-3 h-3" />
                      {locale === 'zh-Hans' ? '风险' : 'At Risk'}
                    </span>
                  )}
                </div>

                {opp.expectedclosedate && (
                  <p className="text-helper text-muted-foreground mt-2">
                    {locale === 'zh-Hans' ? '预计成交' : 'Expected close'}:{' '}
                    {new Date(opp.expectedclosedate).toLocaleDateString(
                      locale === 'zh-Hans' ? 'zh-CN' : 'en-US',
                      { month: 'short', day: 'numeric' }
                    )}
                  </p>
                )}
              </motion.div>
            );
          })}

          {activeOpps.length === 0 && (
            <motion.div variants={itemVariants} className="text-center py-12">
              <p className="text-body text-muted-foreground">
                {locale === 'zh-Hans' ? '暂无活跃商机' : 'No active opportunities'}
              </p>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
