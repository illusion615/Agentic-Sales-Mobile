/**
 * Match Selection Card Component
 * Displays fuzzy match results for user selection
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Search, Check, Building2, User, TrendingUp, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getLocale, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';

interface MatchSelectionCardProps {
  messageId: string;
  matchSelection: {
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
    matches: Array<{
      id: string;
      name: string;
      subtitle?: string;
      score: number;
      matchType: 'exact' | 'contains' | 'fuzzy';
      // For contact matches, include account info
      accountId?: string;
      accountName?: string;
      // For opportunity matches
      stage?: string;
    }>;
    confidence: 'high' | 'medium' | 'low' | 'none';
    pendingAction?: string;
    // Pending intent to execute after user selects a match
    pendingIntent?: {
      function: string;
      arguments: Record<string, unknown>;
    };
  };
  onSelect?: (record: { id: string; name: string; accountId?: string; accountName?: string }) => void;
  // Called when user selects a match and there's a pending intent to continue
  onContinueWithSelection?: (record: { id: string; name: string; accountId?: string; accountName?: string }, pendingIntent: { function: string; arguments: Record<string, unknown> }) => void;
  // Called when user wants to create a new record (skip selection)
  onCreateNew?: (pendingIntent: { function: string; arguments: Record<string, unknown> }) => void;
}

export function MatchSelectionCard({ messageId, matchSelection, onSelect, onContinueWithSelection, onCreateNew }: MatchSelectionCardProps) {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { closePanel } = useCopilot();

  const getEntityIcon = () => {
    switch (matchSelection.entityType) {
      case 'account':
        return Building2;
      case 'contact':
        return User;
      case 'opportunity':
        return TrendingUp;
      case 'activity':
        return Search;
      default:
        return Search;
    }
  };

  const getEntityLabel = () => {
    const labels: Record<string, { zh: string; en: string }> = {
      account: { zh: '客户', en: 'Account' },
      contact: { zh: '联系人', en: 'Contact' },
      opportunity: { zh: '商机', en: 'Opportunity' },
      activity: { zh: '活动', en: 'Activity' },
    };
    return locale === 'zh-Hans' 
      ? labels[matchSelection.entityType]?.zh || matchSelection.entityType
      : labels[matchSelection.entityType]?.en || matchSelection.entityType;
  };

  const getMatchTypeLabel = (matchType: 'exact' | 'contains' | 'fuzzy') => {
    const labels: Record<string, { zh: string; en: string }> = {
      exact: { zh: '精确匹配', en: 'Exact' },
      contains: { zh: '部分匹配', en: 'Contains' },
      fuzzy: { zh: '模糊匹配', en: 'Fuzzy' },
    };
    return locale === 'zh-Hans' ? labels[matchType]?.zh : labels[matchType]?.en;
  };

  const getConfidenceColor = () => {
    switch (matchSelection.confidence) {
      case 'high':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      case 'low':
        return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const handleSelect = (record: { id: string; name: string; accountId?: string; accountName?: string }) => {
    setSelectedId(record.id);
    onSelect?.(record);
    
    // If there's a pending intent, continue with the operation instead of navigating
    if (matchSelection.pendingIntent && onContinueWithSelection) {
      setIsProcessing(true);
      // Call the continue handler with selected record (including accountId/accountName for contacts) and pending intent
      onContinueWithSelection(record, matchSelection.pendingIntent);
      return;
    }
    
    // Otherwise, navigate to the record detail page
    setTimeout(() => {
      closePanel();
      switch (matchSelection.entityType) {
        case 'account':
          navigate(`/accounts/${record.id}`);
          break;
        case 'opportunity':
          navigate(`/opportunities/${record.id}`);
          break;
        case 'activity':
          navigate(`/activities/${record.id}`);
          break;
        case 'contact':
          // Navigate to account page with contact highlighted
          navigate('/accounts');
          break;
      }
    }, 200);
  };

  const handleCreateNew = () => {
    if (matchSelection.pendingIntent && onCreateNew) {
      setIsProcessing(true);
      onCreateNew(matchSelection.pendingIntent);
    }
  };

  const EntityIcon = getEntityIcon();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className="glass-card p-4 rounded-xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <EntityIcon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-sm text-foreground">
            {locale === 'zh-Hans' ? `选择${getEntityLabel()}` : `Select ${getEntityLabel()}`}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-xs px-1.5 py-0.5 rounded', getConfidenceColor())}>
              {locale === 'zh-Hans' 
                ? matchSelection.confidence === 'high' ? '高置信度' 
                  : matchSelection.confidence === 'medium' ? '中置信度' 
                  : matchSelection.confidence === 'low' ? '低置信度' : '未匹配'
                : matchSelection.confidence === 'none' ? 'No match' : `${matchSelection.confidence} confidence`}
            </span>
            <span className="text-xs text-muted-foreground">
              {locale === 'zh-Hans' 
                ? `找到 ${matchSelection.matches.filter((m: { score: number }) => m.score >= 70).length} 个高置信度匹配`
                : `Found ${matchSelection.matches.filter((m: { score: number }) => m.score >= 70).length} high-confidence match${matchSelection.matches.filter((m: { score: number }) => m.score >= 70).length === 1 ? '' : 'es'}`}
            </span>
          </div>
        </div>
      </div>

      {/* No high-confidence matches found */}
      {matchSelection.matches.filter((m: { score: number }) => m.score >= 70).length === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
          <AlertCircle className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {locale === 'zh-Hans' 
              ? '未找到高置信度的匹配记录。请尝试使用更准确的关键词。'
              : 'No high-confidence matches found. Try more specific keywords.'}
          </p>
        </div>
      )}

      {/* Match List - Only show matches with score >= 70 */}
      {matchSelection.matches.filter((m: { score: number }) => m.score >= 70).length > 0 && (
        <div className="space-y-2">
          {matchSelection.matches
            .filter((match: { score: number }) => match.score >= 70)
            .map((match: { id: string; name: string; subtitle?: string; score: number; matchType: 'exact' | 'contains' | 'fuzzy'; accountId?: string; accountName?: string }, index: number) => (
            <motion.button
              key={match.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleSelect({ id: match.id, name: match.name, accountId: match.accountId, accountName: match.accountName })}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg text-left',
                'border transition-all',
                selectedId === match.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border/50 hover:border-border hover:bg-muted/30',
                'active:scale-[0.99]'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  match.score >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                )}>
                  {Math.round(match.score)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{match.name}</p>
                  {match.subtitle && (
                    <p className="text-xs text-muted-foreground">{match.subtitle}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {getMatchTypeLabel(match.matchType)}
                </span>
                {selectedId === match.id && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Create New button when there's a pending draft intent */}
      {matchSelection.pendingIntent && matchSelection.pendingIntent.function.startsWith('draft') && onCreateNew && !isProcessing && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={handleCreateNew}
          >
            <Plus className="w-4 h-4" />
            {locale === 'zh-Hans' 
              ? `跳过，创建新${getEntityLabel()}`
              : `Skip, Create New ${getEntityLabel()}`}
          </Button>
        </div>
      )}

      {/* Action hint */}
      {matchSelection.matches.filter((m: { score: number }) => m.score >= 70).length > 0 && !isProcessing && (
        <p className="text-xs text-muted-foreground mt-3 text-center">
          {matchSelection.pendingIntent
            ? (locale === 'zh-Hans' 
                ? '点击选择一个匹配项继续，或创建新记录'
                : 'Select a match to continue, or create new')
            : (locale === 'zh-Hans' 
                ? '点击选择一个匹配项，或继续输入以缩小范围'
                : 'Click to select a match, or continue typing to narrow down')}
        </p>
      )}
      {isProcessing && (
        <p className="text-xs text-primary mt-3 text-center animate-pulse">
          {locale === 'zh-Hans' ? '正在处理...' : 'Processing...'}
        </p>
      )}
    </motion.div>
  );
}
