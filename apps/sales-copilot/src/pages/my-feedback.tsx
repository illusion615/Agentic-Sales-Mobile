import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, ChevronDown, ChevronUp, ExternalLink, Image, Lightbulb, Loader2, RefreshCw } from 'lucide-react';
import { MobileLayout } from '@/components/mobile-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useAppFeedbackList } from '@/hooks/use-app-feedback';
import type { AppFeedback } from '@/generated/models/app-feedback-model';
import { getLocale, localeBcp47 } from '@/lib/i18n';
import { useFirstMount } from '@/hooks/use-first-mount';
import { motion } from 'motion/react';

function statusLabel(status: AppFeedback['status'], zh: boolean): string {
  const labels: Record<AppFeedback['status'], [string, string]> = {
    collected: ['已收集', 'Collected'],
    submitting: ['同步中', 'Syncing'],
    submitted: ['已提交', 'Submitted'],
    failed: ['同步失败', 'Sync failed'],
    duplicate: ['重复反馈', 'Duplicate'],
  };
  return labels[status]?.[zh ? 0 : 1] ?? status;
}

export default function MyFeedbackPage() {
  const navigate = useNavigate();
  const locale = getLocale();
  const zh = locale === 'zh-Hans';
  const firstMount = useFirstMount('my-feedback');
  const { data: items = [], isLoading, isError, refetch, isFetching } = useAppFeedbackList();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <MobileLayout title={zh ? '我的反馈' : 'My Feedback'} onBack={() => navigate('/settings')} hideVoiceButton>
      <div className="px-4 pb-36 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {zh ? '通过 Copilot 提交的缺陷与改进建议' : 'Bugs and improvements submitted through Copilot'}
          </p>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label={zh ? '刷新' : 'Refresh'}>
            <RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : isError ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyTitle>{zh ? '无法加载反馈' : 'Could not load feedback'}</EmptyTitle>
              <EmptyDescription>{zh ? '请检查连接后重试' : 'Check your connection and try again'}</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => refetch()}>{zh ? '重试' : 'Try again'}</Button>
          </Empty>
        ) : items.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyTitle>{zh ? '还没有反馈' : 'No feedback yet'}</EmptyTitle>
              <EmptyDescription>{zh ? '在 Copilot 中描述问题或改进建议即可提交' : 'Describe a bug or improvement to Copilot to submit one'}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : items.map((item, index) => {
          const open = expanded === item.id;
          const TypeIcon = item.type === 'bug' ? Bug : Lightbulb;
          return (
            <motion.article
              key={item.id}
              initial={firstMount ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.04, 0.2) }}
              className="glass-card rounded-xl overflow-hidden"
            >
              <button type="button" onClick={() => setExpanded(open ? null : item.id)} className="w-full p-4 text-left flex items-start gap-3">
                <div className={item.type === 'bug' ? 'w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center' : 'w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center'}>
                  <TypeIcon className={item.type === 'bug' ? 'w-4 h-4 text-red-600' : 'w-4 h-4 text-amber-600'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{statusLabel(item.status, zh)}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(item.submittedOn).toLocaleString(localeBcp47(locale), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {open && (
                <div className="border-t border-border/50 px-4 py-3 space-y-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">{item.type === 'bug' ? (zh ? '实际表现' : 'Actual behavior') : (zh ? '改进内容' : 'Requested improvement')}</p><p className="whitespace-pre-wrap">{item.description}</p></div>
                  {item.expectedOutcome && <div><p className="text-xs text-muted-foreground">{zh ? '期望结果' : 'Expected outcome'}</p><p className="whitespace-pre-wrap">{item.expectedOutcome}</p></div>}
                  {item.reproductionSteps && <div><p className="text-xs text-muted-foreground">{zh ? '复现步骤' : 'Reproduction steps'}</p><p className="whitespace-pre-wrap">{item.reproductionSteps}</p></div>}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{item.appVersion} · {item.device}</span>
                    <span className="flex items-center gap-1"><Image className="w-3 h-3" />{zh ? '截图保存在反馈记录中' : 'Screenshots saved with feedback'}</span>
                  </div>
                  {item.githubIssueUrl && (
                    <a href={item.githubIssueUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary text-xs">
                      GitHub #{item.githubIssueNumber || ''}<ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {item.syncError && <p className="text-xs text-destructive">{item.syncError}</p>}
                </div>
              )}
            </motion.article>
          );
        })}
      </div>
    </MobileLayout>
  );
}
