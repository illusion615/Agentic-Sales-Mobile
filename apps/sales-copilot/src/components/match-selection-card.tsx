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
import { Search, Check, Building2, User, TrendingUp, AlertCircle, Plus, SkipForward, ChevronDown, ChevronUp, ChevronLeft, CheckCircle2, Phone, Mail, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getLocale, t, pickLabel, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';
import { formatCurrency } from '@/lib/format-currency';
import { recordDetailRoute } from '@/lib/record-route';

// Opportunity metadata rendering — kept consistent with the Opportunities list
// (same stage colors) so the picker row shows account / stage / status / revenue
// / expected close date to help the user pick the right record.
const OPP_STAGE_DOT: Record<string, string> = {
  prospecting: 'bg-[#6366F1]',
  qualification: 'bg-[#0D8F8C]',
  proposal: 'bg-primary',
  negotiation: 'bg-[#F59E0B]',
  won: 'bg-[#10B981]',
  lost: 'bg-muted-foreground',
};

const OPP_STAGE_LABELS: Record<string, { zh: string; en: string }> = {
  prospecting: { zh: '潜在', en: 'Prospecting' },
  qualification: { zh: '资格确认', en: 'Qualification' },
  proposal: { zh: '方案', en: 'Proposal' },
  negotiation: { zh: '谈判', en: 'Negotiation' },
  won: { zh: '赢单', en: 'Won' },
  lost: { zh: '输单', en: 'Lost' },
};

function oppStageLabel(stage: string, locale: Locale): string {
  const m = OPP_STAGE_LABELS[stage];
  return m ? (locale === 'zh-Hans' ? m.zh : m.en) : stage;
}

function oppStatusLabel(stage: string, locale: Locale): string {
  const isClosed = stage === 'won' || stage === 'lost';
  return isClosed ? (locale === 'zh-Hans' ? '已关闭' : 'Closed') : (locale === 'zh-Hans' ? '进行中' : 'Open');
}

function formatShortDate(dateStr: string, locale: Locale): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

type MatchRecord = {
  id: string;
  name: string;
  subtitle?: string;
  score: number;
  matchType: 'exact' | 'contains' | 'fuzzy';
  accountId?: string;
  accountName?: string;
  stage?: string;
  amount?: number;
  expectedCloseDate?: string;
  title?: string;
  phone?: string;
  email?: string;
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
    listMode?: boolean;
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
  onCreateEntity?: (pendingIntent: { function: string; arguments: Record<string, unknown>; additionalActions?: Array<{ function: string; arguments: Record<string, unknown>; reason?: string }> }, entityKind: 'contact' | 'account' | 'opportunity' | 'activity', queryName: string) => void;
  onSkip?: (pendingIntent: { function: string; arguments: Record<string, unknown> }, entityKind: 'contact' | 'account' | 'opportunity' | 'activity') => void;
  onSearchOther?: (newQuery: string, entityType: 'account' | 'contact' | 'opportunity' | 'activity', pendingIntent: { function: string; arguments: Record<string, unknown> }) => void;
  /** Abort the whole action and unlock the composer (dead-loop escape). */
  onCancel?: () => void;
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
  onCancel,
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
  const isListMode = !!matchSelection.listMode;
  // List mode (missing-subject picker): show every candidate as a plain row.
  const highMatches = isListMode ? matchSelection.matches : matchSelection.matches.filter((m) => m.score >= 70);
  const lowMatches = isListMode ? [] : (matchSelection.lowConfidenceMatches ?? []);
  const hasHighMatches = highMatches.length > 0;
  const hasAnyMatches = hasHighMatches || lowMatches.length > 0;

  // Action area visibility — only shown if there's a pending draft intent to resume.
  const pendingIntent = matchSelection.pendingIntent;
  const hasDraftIntent = !!pendingIntent && pendingIntent.function.startsWith('draft');

  // Map entityType → entityKind for create/skip actions.
  // For 'activity' the semantic differs from the dependency entities:
  //   - clicking a row    = "use this existing activity, don't draft a duplicate"
  //   - "create new"      = "draft a new activity anyway, ignore the matches"
  //   - "skip"            = "cancel this activity draft entirely"
  const entityKind: 'contact' | 'account' | 'opportunity' | 'activity' | null =
    matchSelection.entityType === 'contact' ? 'contact'
    : matchSelection.entityType === 'account' ? 'account'
    : matchSelection.entityType === 'opportunity' ? 'opportunity'
    : matchSelection.entityType === 'activity' ? 'activity'
    : null;

  // Skip is hidden for entityKind === 'account' (account is mandatory for
  // draftActivity / draftOpportunity — the user must either pick or create one).
  // For everything else (contact, opportunity, activity) skip is meaningful.
  const skipAllowed = entityKind !== null && entityKind !== 'account';

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
    const labels: Record<string, { zh: string; en: string; de: string; fr: string; es: string }> = {
      account: { zh: '客户', en: 'Account', de: 'Konto', fr: 'Compte', es: 'Cuenta' },
      contact: { zh: '联系人', en: 'Contact', de: 'Kontakt', fr: 'Contact', es: 'Contacto' },
      opportunity: { zh: '商机', en: 'Opportunity', de: 'Verkaufschance', fr: 'Opportunité', es: 'Oportunidad' },
      activity: { zh: '活动', en: 'Activity', de: 'Aktivität', fr: 'Activité', es: 'Actividad' },
    };
    const m = labels[matchSelection.entityType];
    return m ? pickLabel(m, locale) : matchSelection.entityType;
  };

  // (Reason text lives in `buildMatchReasonText` and is rendered above the
  // card by `copilot-panel.tsx`. No in-card copy remains.)

  const getMatchTypeLabel = (matchType: 'exact' | 'contains' | 'fuzzy') => {
    const labels: Record<string, { zh: string; en: string; de: string; fr: string; es: string }> = {
      exact: { zh: '精确匹配', en: 'Exact', de: 'Exakt', fr: 'Exact', es: 'Exacto' },
      contains: { zh: '部分匹配', en: 'Contains', de: 'Enthält', fr: 'Contient', es: 'Contiene' },
      fuzzy: { zh: '模糊匹配', en: 'Fuzzy', de: 'Unscharf', fr: 'Approximatif', es: 'Aproximado' },
    };
    return pickLabel(labels[matchType], locale);
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
      navigate(recordDetailRoute(matchSelection.entityType, record.id));
    }, 200);
  };

  const handleCreateNew = () => {
    if (!pendingIntent || !onCreateEntity || !entityKind) return;
    setIsProcessing(true);
    onCreateEntity(pendingIntent, entityKind, matchSelection.query);
  };

  const handleCancelClick = () => {
    if (isResolved || !onCancel) return;
    setIsProcessing(true);
    onCancel();
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
          {resolutionResult || (t('resolvedLabel', locale))}
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
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isListMode ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
            <EntityIcon className="w-4 h-4" />
          </div>
        ) : (
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0',
            match.score >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
            match.score >= 70 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
            'bg-muted text-muted-foreground',
          )}>
            {Math.round(match.score)}
          </div>
        )}
        {matchSelection.entityType === 'contact' ? (
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{match.name}</p>
            {(match.title || match.accountName) && (
              <p className="text-xs text-muted-foreground truncate">
                {[match.title, match.accountName].filter(Boolean).join(' · ')}
              </p>
            )}
            {match.phone && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                <Phone className="w-3 h-3 shrink-0" />
                <span className="truncate">{match.phone}</span>
              </p>
            )}
            {match.email && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{match.email}</span>
              </p>
            )}
          </div>
        ) : matchSelection.entityType === 'opportunity' ? (
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{match.name}</p>
            {match.accountName && (
              <p className="text-xs text-muted-foreground truncate">{match.accountName}</p>
            )}
            <div className="flex items-center gap-x-1.5 gap-y-0.5 flex-wrap text-[11px] text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', OPP_STAGE_DOT[match.stage ?? ''] ?? 'bg-muted-foreground')} />
                {oppStageLabel(match.stage ?? '', locale)}
              </span>
              <span className="opacity-40">·</span>
              <span>{oppStatusLabel(match.stage ?? '', locale)}</span>
              {typeof match.amount === 'number' && match.amount > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-foreground/70 font-medium">{formatCurrency(match.amount)}</span>
                </>
              )}
              {match.expectedCloseDate && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-0.5">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {formatShortDate(match.expectedCloseDate, locale)}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{match.name}</p>
            {match.subtitle && (
              <p className="text-xs text-muted-foreground truncate">{match.subtitle}</p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isListMode && (
          <span className="text-xs text-muted-foreground">
            {getMatchTypeLabel(match.matchType)}
          </span>
        )}
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
              ? (t('selectEntity', locale, { entity: getEntityLabel() }))
              : (t('noMatchingEntity', locale, { entity: getEntityLabel() }))
            }
          </h4>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {!isListMode && hasHighMatches && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded', getConfidenceColor())}>
                {locale === 'zh-Hans'
                  ? matchSelection.confidence === 'high' ? '高置信度'
                    : matchSelection.confidence === 'medium' ? '中置信度'
                    : matchSelection.confidence === 'low' ? '低置信度' : '未匹配'
                  : matchSelection.confidence === 'none' ? 'No match' : `${matchSelection.confidence} confidence`}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {isListMode
                ? (locale === 'zh-Hans'
                    ? `共 ${highMatches.length} 个候选，或搜索`
                    : `${highMatches.length} option${highMatches.length === 1 ? '' : 's'}, or search`)
                : hasHighMatches
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

      {/* Action area: Create / Search other / Skip. Create+Skip only for draft
          intents; Search is available in list mode too (missing-subject picker). */}
      {!resolved && (hasDraftIntent || isListMode) && entityKind && (
        <div className={cn(
          'mt-4 pt-3 border-t border-border/50 space-y-2',
        )}>
          {hasDraftIntent && (
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
          )}

          {!showSearchInput ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setShowSearchInput(true)}
              disabled={isResolved || !onSearchOther}
            >
              <Search className="w-4 h-4" />
              {t('searchOther', locale)}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 px-2"
                onClick={() => { setShowSearchInput(false); setSearchValue(''); }}
                disabled={isResolved}
                aria-label={locale === 'zh-Hans' ? '返回' : 'Back'}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Input
                autoFocus
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSearchSubmit(); }
                  else if (e.key === 'Escape') { setShowSearchInput(false); setSearchValue(''); }
                }}
                placeholder={t('enterEntityName', locale, { entity: getEntityLabel() })}
                disabled={isResolved}
                className="flex-1 h-9 text-sm"
              />
              <Button
                size="sm"
                onClick={handleSearchSubmit}
                disabled={isResolved || !searchValue.trim()}
              >
                {t('searchGo', locale)}
              </Button>
            </div>
          )}

          {hasDraftIntent && skipAllowed && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2"
              onClick={handleSkip}
              disabled={isResolved || !onSkip}
            >
              <SkipForward className="w-4 h-4" />
              {entityKind === 'activity'
                ? (t('cancelDraft', locale))
                : (t('skip', locale))}
            </Button>
          )}
        </div>
      )}

      {/* Cancel / dismiss — ALWAYS available while unresolved so a blocking card
          (which locks the composer) can never trap the user in a dead loop. */}
      {!resolved && onCancel && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-muted-foreground hover:text-foreground"
          onClick={handleCancelClick}
          disabled={isResolved}
        >
          <X className="w-4 h-4 mr-1" />
          {t('cancel', locale)}
        </Button>
      )}

      {/* Status hint */}
      {isProcessing && (
        <p className="text-xs text-primary mt-3 text-center animate-pulse">
          {t('processing', locale)}
        </p>
      )}
    </motion.div>
  );
}
