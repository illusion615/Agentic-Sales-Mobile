import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Building2, Target, Calendar, ArrowRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLocale, getCopilotListDefaultView, getCopilotListTopN, t } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { useCopilotSideDocked } from '@/components/global-copilot';
import { prefetchForEntityType } from '@/lib/prefetch';

export type RecordType = 'account' | 'opportunity' | 'activity' | 'contact';

export interface RecordItem {
  id: string;
  type: RecordType;
  title: string;
  subtitle?: string;
  meta?: string;
}

export interface RecordListCardProps {
  type: RecordType;
  records: RecordItem[];
  title?: string;
}

const typeConfig = {
  account: {
    icon: Building2,
    labelZh: '客户列表',
    labelEn: 'Accounts',
    route: '/accounts',
  },
  opportunity: {
    icon: Target,
    labelZh: '商机列表',
    labelEn: 'Opportunities',
    route: '/opportunities',
  },
  activity: {
    icon: Calendar,
    labelZh: '活动列表',
    labelEn: 'Activities',
    route: '/activities',
  },
  contact: {
    icon: User,
    labelZh: '联系人列表',
    labelEn: 'Contacts',
    route: '/contacts',
  },
};

export function RecordListCard({ type, records, title }: RecordListCardProps) {
  const [isExpanded, setIsExpanded] = useState(() => getCopilotListDefaultView() === 'expanded');
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  const locale = getLocale();
  const isZh = locale === 'zh-Hans';
  const { closePanel, setPageContext } = useCopilot();
  const { docked } = useCopilotSideDocked();
  const topN = getCopilotListTopN();

  // Prefetch the detail page chunk when this record list renders
  useEffect(() => { prefetchForEntityType(type); }, [type]);
  
  const config = typeConfig[type];
  const Icon = config.icon;
  const displayTitle = title || (isZh ? config.labelZh : config.labelEn);
  const visibleRecords = showAll ? records : records.slice(0, topN);
  const remainingCount = Math.max(0, records.length - visibleRecords.length);

  // Page name labels for each record type
  const pageLabels: Record<RecordType, { zh: string; en: string }> = {
    account: { zh: '客户详情', en: 'Account Detail' },
    opportunity: { zh: '商机详情', en: 'Opportunity Detail' },
    activity: { zh: '活动详情', en: 'Activity Detail' },
    contact: { zh: '联系人详情', en: 'Contact Detail' },
  };

  const handleRecordClick = (record: RecordItem) => {
    // Immediately set page context so the copilot panel updates before data loads
    const label = pageLabels[type];
    setPageContext({
      currentPage: isZh ? label.zh : label.en,
      summary: isZh ? `查看: ${record.title}` : `Viewing: ${record.title}`,
      pageData: { [`${type}Id`]: record.id, [`${type}Name`]: record.title },
    });

    // In docked desktop mode, keep the panel open; on mobile/float, close it
    if (!docked) {
      closePanel();
    }
    setTimeout(() => {
      navigate(`${config.route}/${record.id}`);
    }, docked ? 0 : 150);
  };
  
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-sm">
            {t('noRecordsFound', locale)}
          </span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      {/* Header - 点击展开/收起 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{displayTitle}</span>
          <span className="text-xs text-muted-foreground">({records.length})</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      
      {/* 展开的记录列表 */}
      {isExpanded && (
        <div className="border-t border-border/50">
          {visibleRecords.map((record, index) => (
            <button
              key={record.id}
              onClick={() => handleRecordClick(record)}
              className={cn(
                "w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left",
                index !== visibleRecords.length - 1 && "border-b border-border/30"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{record.title}</div>
                {record.subtitle && (
                  <div className="text-xs text-muted-foreground truncate">{record.subtitle}</div>
                )}
                {record.meta && (
                  <div className="text-xs text-muted-foreground/70 truncate">{record.meta}</div>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
            </button>
          ))}

          {remainingCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full p-3 text-xs text-primary hover:bg-primary/5 transition-colors border-t border-border/30"
            >
              {t('moreRecordsTapAll', locale, { n: remainingCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
