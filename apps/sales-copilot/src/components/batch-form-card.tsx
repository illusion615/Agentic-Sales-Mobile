/**
 * Batch Form Card Component
 * Renders multiple draft forms in a batch for user confirmation
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getLocale, t, type Locale } from '@/lib/i18n';
import { FormCard, type FormCardData } from '@/components/form-card';
import { useCopilot } from '@/contexts/copilot-context';

interface BatchFormCardProps {
  messageId: string;
  batchFormCards: {
    items: Array<{
      type: 'activity' | 'opportunity' | 'account' | 'contact';
      isNew: boolean;
      data: Record<string, unknown>;
      batchIndex: number;
      status?: 'pending' | 'confirmed' | 'modified' | 'cancelled';
    }>;
    totalCount: number;
  };
  onStatusChange?: (index: number, status: 'confirmed' | 'modified' | 'cancelled') => void;
}

export function BatchFormCard({ messageId, batchFormCards, onStatusChange }: BatchFormCardProps) {
  const locale: Locale = getLocale();
  const copilot = useCopilot();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0); // First item expanded by default
  
  // Initialize statuses from batchFormCards (restored from session storage)
  const [itemStatuses, setItemStatuses] = useState<Record<number, 'pending' | 'confirmed' | 'modified' | 'cancelled'>>(() => {
    const initial: Record<number, 'pending' | 'confirmed' | 'modified' | 'cancelled'> = {};
    batchFormCards.items.forEach((item, index: number) => {
      if (item.status) {
        initial[index] = item.status;
      }
    });
    return initial;
  });

  const getTypeLabel = (type: string) => {
    const keyMap: Record<string, 'activityTab' | 'opportunity' | 'account' | 'contact'> = {
      activity: 'activityTab',
      opportunity: 'opportunity',
      account: 'account',
      contact: 'contact',
    };
    const key = keyMap[type];
    return key ? t(key, locale) : type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      activity: 'bg-primary/10 text-primary',
      opportunity: 'bg-green-500/10 text-green-600',
      account: 'bg-blue-500/10 text-blue-600',
      contact: 'bg-purple-500/10 text-purple-600',
    };
    return colors[type] || 'bg-muted text-muted-foreground';
  };

  const handleItemStatusChange = (index: number, status: 'confirmed' | 'modified' | 'cancelled') => {
    setItemStatuses((prev) => ({ ...prev, [index]: status }));
    // Persist batch item status to message for session storage
    copilot.updateFormCardStatus(messageId, status, index);
    onStatusChange?.(index, status);
  };

  const allConfirmed = batchFormCards.items.every(
    (_, index) => itemStatuses[index] === 'confirmed'
  );

  const confirmedCount = Object.values(itemStatuses).filter((s) => s === 'confirmed').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className="glass-card rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="font-medium text-sm text-foreground">
              {t('batchCreate', locale)}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('batchRecordsConfirmed', locale, { total: batchFormCards.totalCount, confirmed: confirmedCount })}
            </p>
          </div>
        </div>
        {allConfirmed && (
          <div className="flex items-center gap-1.5 text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-md">
            <Check className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">
              {t('allSaved', locale)}
            </span>
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="divide-y divide-border/30">
        {batchFormCards.items.map((item, index) => {
          const isExpanded = expandedIndex === index;
          const status = itemStatuses[index] || 'pending';
          const duplicateOf = (item.data as Record<string, unknown>)._duplicateOf as
            | { existingId?: string; subject?: string; scheduleddate?: string }
            | undefined;
          
          return (
            <div key={`${messageId}-batch-${index}`} className="bg-background/50">
              {/* Item Header */}
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className={cn(
                  'w-full flex items-center justify-between p-3 text-left',
                  'hover:bg-muted/30 transition-colors',
                  status === 'confirmed' && 'bg-green-50/50 dark:bg-green-900/10'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    getTypeColor(item.type)
                  )}>
                    {getTypeLabel(item.type)}
                  </span>
                  <span className="text-sm text-foreground">
                    {(item.data.name || item.data.title || item.data.fullName || `#${index + 1}`) as string}
                  </span>
                  {duplicateOf && (
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                      title={
                        duplicateOf.subject
                          ? `${duplicateOf.subject}${duplicateOf.scheduleddate ? ' · ' + duplicateOf.scheduleddate.slice(0, 10) : ''}`
                          : ''
                      }
                    >
                      {t('possibleDuplicate', locale)}
                    </span>
                  )}
                  {status === 'confirmed' && (
                    <Check className="w-4 h-4 text-green-600" />
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="px-3 pb-3"
                >
                  <FormCard
                    messageId={`${messageId}-batch-${index}`}
                    formCard={{
                      type: item.type,
                      isNew: item.isNew,
                      data: item.data,
                      status: status,
                    }}
                    onStatusChange={(newStatus) => handleItemStatusChange(index, newStatus)}
                  />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
