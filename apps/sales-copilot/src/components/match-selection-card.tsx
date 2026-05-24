/**
 * Match Selection Card Component (unified resolution card)
 *
 * Single card for ALL fuzzy-match outcomes:
 *  • >0 high-confidence matches   → render the score-ranked list + action area
 *  • 0 matches                    → empty state header + action area only
 *  • low-confidence candidates    → folded behind "Show more matches"
 *
 * Action area is constant regardless of match count:
 *  • Create new {entity}  — chain-create the entity (e.g. opens draftContact form, resumes parent after save)
 *  • Search other         — inline input, Enter triggers in-place fuzzyMatch refresh on THIS message
 *  • Skip                 — strip entity from args, open the main draft form so the user picks in-form
 *                           (hidden when entityType === 'account' because account is required for draftActivity/Opportunity)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Search, Check, Building2, User, TrendingUp, AlertCircle, Plus, SkipForward, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getLocale, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';

type MatchRecord = {
  id: string;
  name: string;
  subtitle?: string;
  score: number;
  matchType: 'exact' | 'contains' | 'fuzzy';
  accountId?: string;
  accountName?: string;
  stage?: string;
};

/**
 * Build the "why are we asking this?" sentence shown above the card. Exported
 * so [`copilot-panel`](./copilot-panel.tsx) can render it in the chat flow
 * instead of having it nested inside the card itself (keeps the card focused
 * on the matches + actions and surfaces the explanation as a regular
 * assistant message).
 */
export function buildMatchReasonText(args: {
  entityType: 'account' | 'contact' | 'opportunity' | 'activity';
  query: string;
  pendingFn?: string;
  locale: Locale;
}): string {
  const { entityType, locale } = args;
  const q = (args.query ?? '').trim();
  const fn = args.pendingFn ?? '';
  const draftKindLabels: Record<string, { zh: string; en: string }> = {
    draftActivity: { zh: '记录这次活动', en: 'log this activity' },
    draftOpportunity: { zh: '创建这个商机', en: 'create this opportunity' },
    draftContact: { zh: '新建这个联系人', en: 'add this contact' },
    draftAccount: { zh: '新建这个客户', en: 'create this account' },
  };
  const action = draftKindLabels[fn]
    ?? (fn.startsWith('update') ? { zh: '完成更新', en: 'complete the update' } : { zh: '继续操作', en: 'continue' });

  if (locale === 'zh-Hans') {
    const tail = q ? `你提到的“${q}”在系统里有以下匹配：` : '系统里找到以下候选：';
    switch (entityType) {
      case 'account':
        return `要${action.zh}，得先确认涉及的客户。${tail}`;
      case 'contact':
        return `要${action.zh}，得先确认对接的联系人。${tail}`;
      case 'opportunity':
        return `要${action.zh}，得先关联到正确的商机。${tail}`;
      case 'activity':
        return q
          ? `先检查一下系统里是否已经有同名活动，避免重复记录。“${q}”的相近候选：`
          : `先检查一下系统里是否已经有相似活动，避免重复记录。`;
      default:
        return '';
    }
  }
  const enTail = q ? `Here's what I found for “${q}”:` : `Here's what I found:`;
  switch (entityType) {
    case 'account':
      return `To ${action.en}, I need to know which account this is about. ${enTail}`;
    case 'contact':
      return `To ${action.en}, I need to confirm the contact. ${enTail}`;
    case 'opportunity':
      return `To ${action.en}, I need to attach it to the right opportunity. ${q ? `Matches for “${q}”:` : 'Candidates:'}`;
    case 'activity':
      return q
        ? `Checking for existing activities so we don't duplicate. Candidates similar to “${q}”:`
        : `Checking for existing activities so we don't duplicate.`;
    default:
      return '';
  }
}

interface MatchSelectionCardProps {
  messageId: string;
  matchSelection: {
    entityType: 'account' | 'contact' | 'opportunity' | 'activity';
    query: string;
    matches: MatchRecord[];
    lowConfidenceMatches?: MatchRecord[];
    confidence: 'high' | 'medium' | 'low' | 'none';
    pendingAction?: string;
    pendingIntent?: {
      function: string;
      arguments: Record<string, unknown>;
      // G-1: optional inferred siblings forwarded so chain-create resume can replay them
      additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }>;
    };
  };
  resolved?: boolean;
  resolutionResult?: string;
  onSelect?: (record: { id: string; name: string; accountId?: string; accountName?: string }) => void;
  onContinueWithSelection?: (record: { id: string; name: string; accountId?: string; accountName?: string }, pendingIntent: { function: string; arguments: Record<string, unknown>; additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> }) => void;
  onCreateEntity?: (pendingIntent: { function: string; arguments: Record<string, unknown>; additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> }, entityKind: 'contact' | 'account' | 'opportunity', queryName: string) => void;
  onSkip?: (pendingIntent: { function: string; arguments: Record<string, unknown> }, entityKind: 'contact' | 'account' | 'opportunity') => void;
  onSearchOther?: (newQuery: string, entityType: 'account' | 'contact' | 'opportunity' | 'activity', pendingIntent: { function: string; arguments: Record<string, unknown> }) => void;
}

export function MatchSelectionCard({
  messageId: _messageId,
  matchSelection,
  resolved = false,
  resolutionResult,
  onSelect,
  onContinueWithSelection,
  onCreateEntity,
  onSkip,
  onSearchOther,
}: MatchSelectionCardProps) {
  const navigate = useNavigate();
  const locale: Locale = getLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [showLowConf, setShowLowConf] = useState(false);
  const { closePanel } = useCopilot();

  const isResolved = resolved || isProcessing;
  const highMatches = matchSelection.matches.filter((m) => m.score >= 70);
  const lowMatches = matchSelection.lowConfidenceMatches ?? [];
  const hasHighMatches = highMatches.length > 0;
  const hasAnyMatches = hasHighMatches || lowMatches.length > 0;

  // Action area visibility — only shown if there's a pending draft intent to resume.
  const pendingIntent = matchSelection.pendingIntent;
  const hasDraftIntent = !!pendingIntent && pendingIntent.function.startsWith('draft');

  // Map entityType → entityKind for create/skip actions.
  // activity self-dup detection has no chain-create / skip semantic.
  const entityKind: 'contact' | 'account' | 'opportunity' | null =
    matchSelection.entityType === 'contact' ? 'contact'
    : matchSelection.entityType === 'account' ? 'account'
    : matchSelection.entityType === 'opportunity' ? 'opportunity'
    : null;

  // Skip is hidden for entityKind === 'account' (account is mandatory for draftActivity / draftOpportunity)
  // and for entityType === 'activity' (skipping a duplicate activity match has no clean semantic).
  const skipAllowed = entityKind !== null && entityKind !== 'account' && matchSelection.entityType !== 'activity';

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

  // (Reason text lives in `buildMatchReasonText` and is rendered above the
  // card by `copilot-panel.tsx`. No in-card copy remains.)

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
    if (isResolved) return;
    setSelectedId(record.id);
    onSelect?.(record);

    if (pendingIntent && onContinueWithSelection) {
      setIsProcessing(true);
      onContinueWithSelection(record, pendingIntent);
      return;
    }

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
          navigate('/accounts');
          break;
      }
    }, 200);
  };

  const handleCreateNew = () => {
    if (!pendingIntent || !onCreateEntity || !entityKind) return;
    setIsProcessing(true);
    onCreateEntity(pendingIntent, entityKind, matchSelection.query);
  };

  const handleSkip = () => {
    if (!pendingIntent || !onSkip || !entityKind) return;
    setIsProcessing(true);
    onSkip(pendingIntent, entityKind);
  };

  const handleSearchSubmit = () => {
    const q = searchValue.trim();
    if (!q || !pendingIntent || !onSearchOther) return;
    onSearchOther(q, matchSelection.entityType, pendingIntent);
    setSearchValue('');
    setShowSearchInput(false);
  };

  const EntityIcon = getEntityIcon();

  // Compact resolved state: a single-line pill instead of a full glass card.
  // Keeps the user's focus on the next pending step in the multi-intent chain
  // and de-clutters the conversation as steps complete.
  if (resolved) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/15 max-w-full"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <EntityIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-foreground truncate">
          {resolutionResult || (locale === 'zh-Hans' ? '已处理' : 'Resolved')}
        </span>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">
          · {getEntityLabel()}
        </span>
      </motion.div>
    );
  }

  const renderMatchRow = (match: MatchRecord, index: number, isLowConf = false) => (
    <motion.button
      key={match.id}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => handleSelect({ id: match.id, name: match.name, accountId: match.accountId, accountName: match.accountName })}
      disabled={isResolved}
      className={cn(
        'w-full flex items-center justify-between p-3 rounded-lg text-left',
        'border transition-all',
        selectedId === match.id
          ? 'border-primary bg-primary/5'
          : 'border-border/50 hover:border-border hover:bg-muted/30',
        'active:scale-[0.99]',
        isResolved && 'opacity-60 cursor-not-allowed',
        isLowConf && 'opacity-75',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
          match.score >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
          match.score >= 70 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
          'bg-muted text-muted-foreground',
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
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className={cn(
        'glass-card p-4 rounded-xl',
        isProcessing && 'opacity-60 pointer-events-none',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          hasHighMatches ? 'bg-primary/10' : 'bg-orange-100 dark:bg-orange-900/20',
        )}>
          <EntityIcon className={cn(
            'w-5 h-5',
            hasHighMatches ? 'text-primary' : 'text-orange-600 dark:text-orange-400',
          )} />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-sm text-foreground">
            {hasHighMatches
              ? (locale === 'zh-Hans' ? `选择${getEntityLabel()}` : `Select ${getEntityLabel()}`)
              : (locale === 'zh-Hans' ? `未找到匹配的${getEntityLabel()}` : `No matching ${getEntityLabel().toLowerCase()} found`)
            }
          </h4>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {hasHighMatches && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded', getConfidenceColor())}>
                {locale === 'zh-Hans'
                  ? matchSelection.confidence === 'high' ? '高置信度'
                    : matchSelection.confidence === 'medium' ? '中置信度'
                    : matchSelection.confidence === 'low' ? '低置信度' : '未匹配'
                  : matchSelection.confidence === 'none' ? 'No match' : `${matchSelection.confidence} confidence`}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {hasHighMatches
                ? (locale === 'zh-Hans'
                    ? `找到 ${highMatches.length} 个高置信度匹配`
                    : `Found ${highMatches.length} high-confidence match${highMatches.length === 1 ? '' : 'es'}`)
                : (locale === 'zh-Hans'
                    ? `搜索: ${matchSelection.query}`
                    : `Searched: ${matchSelection.query}`)
              }
            </span>
          </div>
        </div>
      </div>

      {/* Reason text moved out of the card: see `buildMatchReasonText` rendered
          by `copilot-panel.tsx` above the card. */}

      {/* High-confidence match list */}
      {!resolved && hasHighMatches && (
        <div className="space-y-2">
          {highMatches.map((m, i) => renderMatchRow(m, i, false))}
        </div>
      )}

      {/* Empty state (no matches at all) */}
      {!resolved && !hasAnyMatches && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 mb-1">
          <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            {locale === 'zh-Hans'
              ? '请选择下方操作继续。'
              : 'Pick an action below to continue.'}
          </p>
        </div>
      )}

      {/* Low-confidence collapsible */}
      {!resolved && lowMatches.length > 0 && (
        <div className={cn('mt-2', hasHighMatches && 'pt-2')}>
          <button
            type="button"
            onClick={() => setShowLowConf((v) => !v)}
            disabled={isResolved}
            className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1.5"
          >
            {showLowConf ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {locale === 'zh-Hans'
              ? (showLowConf ? `隐藏 ${lowMatches.length} 个低置信度候选` : `显示 ${lowMatches.length} 个低置信度候选`)
              : (showLowConf ? `Hide ${lowMatches.length} low-confidence` : `Show ${lowMatches.length} low-confidence match${lowMatches.length === 1 ? '' : 'es'}`)
            }
          </button>
          {showLowConf && (
            <div className="space-y-2 mt-1">
              {lowMatches.map((m, i) => renderMatchRow(m, i, true))}
            </div>
          )}
        </div>
      )}

      {/* Action area: Create / Search other / Skip */}
      {!resolved && hasDraftIntent && entityKind && (
        <div className={cn(
          'mt-4 pt-3 border-t border-border/50 space-y-2',
        )}>
          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            onClick={handleCreateNew}
            disabled={isResolved || !onCreateEntity}
          >
            <Plus className="w-4 h-4" />
            {locale === 'zh-Hans'
              ? `新建${getEntityLabel()}`
              : `Create new ${getEntityLabel().toLowerCase()}`}
          </Button>

          {!showSearchInput ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setShowSearchInput(true)}
              disabled={isResolved || !onSearchOther}
            >
              <Search className="w-4 h-4" />
              {locale === 'zh-Hans' ? '搜索其他' : 'Search other'}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSearchSubmit(); }
                  else if (e.key === 'Escape') { setShowSearchInput(false); setSearchValue(''); }
                }}
                placeholder={locale === 'zh-Hans' ? `输入${getEntityLabel()}名称` : `Enter ${getEntityLabel().toLowerCase()} name`}
                disabled={isResolved}
                className="flex-1 h-9 text-sm"
              />
              <Button
                size="sm"
                onClick={handleSearchSubmit}
                disabled={isResolved || !searchValue.trim()}
              >
                {locale === 'zh-Hans' ? '搜索' : 'Go'}
              </Button>
            </div>
          )}

          {skipAllowed && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2"
              onClick={handleSkip}
              disabled={isResolved || !onSkip}
            >
              <SkipForward className="w-4 h-4" />
              {locale === 'zh-Hans' ? '跳过' : 'Skip'}
            </Button>
          )}
        </div>
      )}

      {/* Status hint */}
      {isProcessing && (
        <p className="text-xs text-primary mt-3 text-center animate-pulse">
          {locale === 'zh-Hans' ? '正在处理...' : 'Processing...'}
        </p>
      )}
    </motion.div>
  );
}
