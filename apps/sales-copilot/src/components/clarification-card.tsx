/**
 * Clarification Card Component
 * Replaces plain-text "No X matches" prompts with a 3-action card:
 *   - Create new {entity}
 *   - Search other records (inline input)
 *   - Skip
 * Dispatches via copilot.sendMessage so the existing awaiting-clarification gate handles it.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Search, SkipForward, User, Building2, TrendingUp, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getLocale, type Locale } from '@/lib/i18n';
import { useCopilot } from '@/contexts/copilot-context';

interface ClarificationCardProps {
  messageId: string;
  pendingKind: 'contact' | 'account' | 'opportunity';
  queryName: string;
  resolved?: boolean;
}

export function ClarificationCard({ pendingKind, queryName, resolved }: ClarificationCardProps) {
  const locale: Locale = getLocale();
  const { sendMessage } = useCopilot();
  const [searchMode, setSearchMode] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const entityLabel = (() => {
    const labels: Record<typeof pendingKind, { zh: string; en: string }> = {
      contact: { zh: '联系人', en: 'contact' },
      account: { zh: '客户', en: 'account' },
      opportunity: { zh: '商机', en: 'opportunity' },
    };
    return locale === 'zh-Hans' ? labels[pendingKind].zh : labels[pendingKind].en;
  })();

  const Icon = pendingKind === 'contact' ? User : pendingKind === 'account' ? Building2 : TrendingUp;

  const handleCreate = () => {
    if (resolved) return;
    sendMessage(locale === 'zh-Hans' ? `新建${entityLabel}` : `Create new ${entityLabel}`);
  };

  const handleSkip = () => {
    if (resolved) return;
    sendMessage(locale === 'zh-Hans' ? '跳过' : 'Skip');
  };

  const handleSearchSubmit = () => {
    const v = searchValue.trim();
    if (!v || resolved) return;
    sendMessage(v);
    setSearchMode(false);
    setSearchValue('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      className={cn('glass-card p-4 rounded-xl', resolved && 'opacity-60 pointer-events-none')}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-foreground">
            {locale === 'zh-Hans'
              ? `未找到匹配的${entityLabel}`
              : `No matching ${entityLabel} found`}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {locale === 'zh-Hans' ? '搜索关键词：' : 'Searched: '}
            <span className="font-medium text-foreground">{queryName || '—'}</span>
          </p>
        </div>
      </div>

      {/* Search inline input mode */}
      {searchMode ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchSubmit();
                } else if (e.key === 'Escape') {
                  setSearchMode(false);
                  setSearchValue('');
                }
              }}
              placeholder={
                locale === 'zh-Hans'
                  ? `输入其他${entityLabel}名称...`
                  : `Enter another ${entityLabel} name...`
              }
              className="h-9 text-sm"
            />
            <Button size="sm" className="h-9 px-3" onClick={handleSearchSubmit} disabled={!searchValue.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => { setSearchMode(false); setSearchValue(''); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {locale === 'zh-Hans' ? '取消' : 'Cancel'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button variant="default" size="sm" className="justify-start gap-2" onClick={handleCreate}>
            <Plus className="w-4 h-4" />
            {locale === 'zh-Hans' ? `新建${entityLabel}` : `Create new`}
          </Button>
          <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => setSearchMode(true)}>
            <Search className="w-4 h-4" />
            {locale === 'zh-Hans' ? '搜索其他记录' : 'Search other'}
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" onClick={handleSkip}>
            <SkipForward className="w-4 h-4" />
            {locale === 'zh-Hans' ? '跳过' : 'Skip'}
          </Button>
        </div>
      )}

      {resolved && (
        <p className="text-xs text-muted-foreground mt-3 italic">
          {locale === 'zh-Hans' ? '已处理' : 'Resolved'}
        </p>
      )}
    </motion.div>
  );
}
