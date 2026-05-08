import { motion } from 'motion/react';
import { ChevronRight, Calendar, Target, Users, Zap, Phone, MapPin, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLocale } from '@/lib/i18n';

// Animation variants
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
} as const;

export interface AgendaItem {
  id: string;
  type: 'call' | 'visit' | 'proposal' | 'follow-up';
  label: string;
}

export interface HotOpportunity {
  id: string;
  name: string;
  amount: number;
  stage: string;
}

export interface AtRiskClient {
  id: string;
  name: string;
}

export interface KPIData {
  // Today's Agenda
  agendaItems: AgendaItem[];
  agendaCompleted: number;
  
  // Hot Opportunities
  hotOpportunities: HotOpportunity[];
  hotOpportunitiesValue: number;
  closingThisWeek: number;
  
  // Client Coverage
  clientsTouchedThisWeek: number;
  totalClients: number;
  clientsAtRisk: number;
  clientsAtRiskList: AtRiskClient[];
  
  // Weekly Momentum
  activitiesThisWeek: number;
  weeklyTarget: number;
  visitCount: number;
  callCount: number;
}

interface KPICardsProps {
  data: KPIData;
  onNavigate: (path: string) => void;
}

const typeIcons = {
  'call': Phone,
  'visit': MapPin,
  'proposal': FileText,
  'follow-up': CheckCircle2,
};

function formatCurrency(value: number, locale: string): string {
  if (locale === 'zh-Hans') {
    if (value >= 10000) {
      return `¥${(value / 10000).toFixed(0)}万`;
    }
    return `¥${value.toLocaleString()}`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

// Progress ring with value in center
function ProgressRingWithValue({ 
  progress, 
  value, 
  size = 48, 
  strokeWidth = 4,
  colorClass
}: { 
  progress: number; 
  value: string;
  size?: number; 
  strokeWidth?: number;
  colorClass: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;
  
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
          className="text-muted/20"
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
          className={colorClass}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-foreground leading-none">{value}</span>
      </div>
    </div>
  );
}

export function KPICards({ data, onNavigate }: KPICardsProps) {
  const locale = getLocale();
  
  // Calculate derived values
  const agendaTotal = data.agendaItems.length;
  const agendaProgress = agendaTotal > 0 ? Math.round((data.agendaCompleted / agendaTotal) * 100) : 0;
  const coverageProgress = data.totalClients > 0 ? Math.round((data.clientsTouchedThisWeek / data.totalClients) * 100) : 0;
  const momentumProgress = data.weeklyTarget > 0 ? Math.round((data.activitiesThisWeek / data.weeklyTarget) * 100) : 0;
  
  // Color classes based on progress
  const getAgendaColor = () => {
    if (agendaProgress >= 80) return 'text-emerald-500';
    if (agendaProgress >= 50) return 'text-amber-500';
    return 'text-blue-500';
  };
  
  const getCoverageColor = () => {
    if (coverageProgress >= 80) return 'text-emerald-500';
    if (coverageProgress >= 50) return 'text-amber-500';
    return 'text-emerald-500';
  };
  
  const getMomentumColor = () => {
    if (momentumProgress >= 100) return 'text-emerald-500';
    if (momentumProgress >= 70) return 'text-amber-500';
    return 'text-violet-500';
  };
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Today's Agenda */}
      <motion.div
        variants={itemVariants}
        className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors relative"
        style={{ borderRadius: 20 }}
        onClick={() => onNavigate('/activities')}
      >
        <ChevronRight className="absolute top-3 right-3 w-4 h-4 text-muted-foreground/50" />
        
        {/* Header with progress ring */}
        <div className="flex items-center gap-3 mb-3">
          <ProgressRingWithValue
            progress={agendaProgress}
            value={`${agendaProgress}%`}
            colorClass={getAgendaColor()}
          />
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-muted-foreground mb-0.5">
              {locale === 'zh-Hans' ? '今日待办' : "Today's Agenda"}
            </p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.agendaCompleted}/{agendaTotal}
            </p>
          </div>
        </div>
        
        {/* Agenda breakdown */}
        <div className="space-y-1">
          {data.agendaItems.slice(0, 3).map((item: AgendaItem) => {
            const Icon = typeIcons[item.type] || CheckCircle2;
            return (
              <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="w-3 h-3 text-primary/70" />
                <span className="truncate">{item.label}</span>
              </div>
            );
          })}
          {data.agendaItems.length > 3 && (
            <p className="text-xs text-muted-foreground/60 pl-4.5">
              +{data.agendaItems.length - 3} {locale === 'zh-Hans' ? '更多' : 'more'}
            </p>
          )}
        </div>
      </motion.div>
      
      {/* Hot Opportunities */}
      <motion.div
        variants={itemVariants}
        className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors relative"
        style={{ borderRadius: 20 }}
        onClick={() => onNavigate('/opportunity-review')}
      >
        <ChevronRight className="absolute top-3 right-3 w-4 h-4 text-muted-foreground/50" />
        
        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-muted-foreground mb-0.5">
              {locale === 'zh-Hans' ? '热门商机' : 'Hot Opportunities'}
            </p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {formatCurrency(data.hotOpportunitiesValue, locale)}
            </p>
          </div>
        </div>
        
        {/* Opportunity breakdown */}
        <div className="space-y-1">
          {data.hotOpportunities.slice(0, 2).map((opp: HotOpportunity) => (
            <div key={opp.id} className="flex items-center justify-between gap-1 text-xs">
              <span className="text-muted-foreground truncate flex-1">{opp.name}</span>
              <span className="text-foreground/80 font-medium flex-shrink-0">
                {formatCurrency(opp.amount, locale)}
              </span>
            </div>
          ))}
        </div>
        
        {/* Closing this week badge */}
        <div className="mt-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            {data.closingThisWeek} {locale === 'zh-Hans' ? '个本周到期' : 'closing this week'}
          </span>
        </div>
      </motion.div>
      
      {/* Client Coverage */}
      <motion.div
        variants={itemVariants}
        className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors relative"
        style={{ borderRadius: 20 }}
        onClick={() => onNavigate('/clients')}
      >
        <ChevronRight className="absolute top-3 right-3 w-4 h-4 text-muted-foreground/50" />
        
        {/* Header with progress ring */}
        <div className="flex items-center gap-3 mb-3">
          <ProgressRingWithValue
            progress={coverageProgress}
            value={`${coverageProgress}%`}
            colorClass={getCoverageColor()}
          />
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-muted-foreground mb-0.5">
              {locale === 'zh-Hans' ? '客户覆盖' : 'Client Coverage'}
            </p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.clientsTouchedThisWeek}/{data.totalClients}
            </p>
          </div>
        </div>
        
        {/* At risk clients list */}
        {data.clientsAtRiskList.length > 0 && (
          <div className="space-y-1">
            {data.clientsAtRiskList.slice(0, 2).map((client: AtRiskClient) => (
              <div key={client.id} className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span className="truncate">{client.name}</span>
              </div>
            ))}
            {data.clientsAtRiskList.length > 2 && (
              <p className="text-xs text-muted-foreground/60 pl-3">
                +{data.clientsAtRiskList.length - 2} {locale === 'zh-Hans' ? '更多需关注' : 'more need attention'}
              </p>
            )}
          </div>
        )}
      </motion.div>
      
      {/* Weekly Momentum */}
      <motion.div
        variants={itemVariants}
        className="glass-card p-3 cursor-pointer hover:bg-muted/50 transition-colors relative"
        style={{ borderRadius: 20 }}
        onClick={() => onNavigate('/activities?view=week')}
      >
        <ChevronRight className="absolute top-3 right-3 w-4 h-4 text-muted-foreground/50" />
        
        {/* Header with progress ring */}
        <div className="flex items-center gap-3 mb-3">
          <ProgressRingWithValue
            progress={Math.min(momentumProgress, 100)}
            value={`${Math.min(momentumProgress, 100)}%`}
            colorClass={getMomentumColor()}
          />
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-muted-foreground mb-0.5">
              {locale === 'zh-Hans' ? '本周动力' : 'Weekly Momentum'}
            </p>
            <p className="text-lg font-bold text-foreground leading-tight">
              {data.activitiesThisWeek}/{data.weeklyTarget}
            </p>
          </div>
        </div>
        
        {/* Activity breakdown */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>{data.visitCount} {locale === 'zh-Hans' ? '拜访' : 'visits'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            <span>{data.callCount} {locale === 'zh-Hans' ? '通话' : 'calls'}</span>
          </div>
        </div>
        
        {/* Status text */}
        <p className={cn(
          "text-xs font-medium mt-1.5",
          momentumProgress >= 100 ? 'text-emerald-600 dark:text-emerald-400' :
          momentumProgress >= 70 ? 'text-amber-600 dark:text-amber-400' :
          'text-violet-600 dark:text-violet-400'
        )}>
          {momentumProgress >= 100 
            ? (locale === 'zh-Hans' ? '🎉 目标达成!' : '🎉 Target hit!')
            : momentumProgress >= 70
            ? (locale === 'zh-Hans' ? '接近目标' : 'Almost there')
            : (locale === 'zh-Hans' ? '继续加油' : 'Keep going')
          }
        </p>
      </motion.div>
    </div>
  );
}
