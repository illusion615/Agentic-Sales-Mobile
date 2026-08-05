import { ChevronDown, History, Phone, Sparkles, Wrench } from 'lucide-react';
import type { Briefing } from '@/domain/briefing';
import type { CustomerProfile, ServiceHistoryEntry } from '@/domain/customer';
import type { WorkOrderDetail } from '@/domain/work-order';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function CaptureContextPanel({
  open,
  onToggle,
  workOrder,
  customer,
  history,
  briefing,
  briefingPending,
  briefingError,
  onRetryBriefing,
}: {
  open: boolean;
  onToggle: () => void;
  workOrder?: WorkOrderDetail;
  customer?: CustomerProfile;
  history: readonly ServiceHistoryEntry[];
  briefing?: Briefing;
  briefingPending: boolean;
  briefingError: boolean;
  onRetryBriefing: () => void;
}) {
  return (
    <section className="capture-context-panel glass-card overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wrench className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">工单与客户背景</span>
          <span className="block truncate text-xs text-muted-foreground">
            {workOrder ? `${workOrder.number} · ${workOrder.incidentType ?? '未分类'} · ${workOrder.customerName}` : '正在加载…'}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-border/60 p-4">
            {workOrder && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">本次工单</h3>
                <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">客户</dt>
                  <dd className="text-foreground">{workOrder.customerName}</dd>
                  <dt className="text-muted-foreground">工单</dt>
                  <dd className="text-foreground">{workOrder.number} · {workOrder.incidentType ?? '未分类'}</dd>
                  {workOrder.assetName && <><dt className="text-muted-foreground">设备</dt><dd className="text-foreground">{workOrder.assetName}</dd></>}
                  {workOrder.contactName && (
                    <>
                      <dt className="text-muted-foreground">联系人</dt>
                      <dd className="text-foreground">
                        {workOrder.contactName}
                        {workOrder.contactPhone && <a href={`tel:${workOrder.contactPhone}`} className="ml-2 text-primary">{workOrder.contactPhone}</a>}
                      </dd>
                    </>
                  )}
                </dl>
                {workOrder.summary && <p className="mt-3 text-sm leading-relaxed text-foreground/80">{workOrder.summary}</p>}
                {workOrder.instructions && <p className="mt-2 rounded-lg bg-muted/60 p-2 text-sm leading-relaxed text-foreground/80">{workOrder.instructions}</p>}
              </section>
            )}

            {customer && (
              <section className="border-t border-border/60 pt-4">
                <h3 className="text-xs font-medium text-muted-foreground">客户背景</h3>
                {customer.industry && <p className="mt-2 text-sm text-foreground/80">行业：{customer.industry}</p>}
                {customer.siteAccessNotes && <p className="mt-2 text-sm leading-relaxed text-foreground/80">进场说明：{customer.siteAccessNotes}</p>}
                {customer.cautions && customer.cautions.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
                    {customer.cautions.map((caution) => <li key={caution}>{caution}</li>)}
                  </ul>
                )}
                {customer.contacts.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {customer.contacts.map((contact) => (
                      <li key={`${contact.name}-${contact.phone ?? ''}`} className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground/80">{contact.name}{contact.role ? ` · ${contact.role}` : ''}</span>
                        {contact.phone && <a href={`tel:${contact.phone}`} className="ml-auto text-primary">{contact.phone}</a>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="border-t border-border/60 pt-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-medium text-muted-foreground">服务前洞察</h3>
              </div>
              {briefingPending && <p className="mt-2 text-sm text-muted-foreground">正在整理这次服务的背景…</p>}
              {briefingError && (
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm text-rose-600">AI 洞察暂时不可用，其余背景信息不受影响。</p>
                  <button type="button" onClick={onRetryBriefing} className="shrink-0 rounded-full px-2.5 py-0.5 text-xs text-rose-600 ring-1 ring-rose-300">重试</button>
                </div>
              )}
              {briefing && (
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground/80">
                  <p>{briefing.background}</p>
                  {briefing.watchOuts.length > 0 && <p><span className="font-medium text-amber-700 dark:text-amber-300">注意：</span>{briefing.watchOuts.join('；')}</p>}
                  {briefing.preparation.length > 0 && <p><span className="font-medium text-emerald-700 dark:text-emerald-300">准备：</span>{briefing.preparation.join('；')}</p>}
                </div>
              )}
            </section>

            <section className="border-t border-border/60 pt-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-medium text-muted-foreground">最近服务记录</h3>
              </div>
              {history.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">暂无历史服务记录。</p>
              ) : (
                <ol className="mt-2 flex flex-col gap-3">
                  {history.map((entry) => (
                    <li key={entry.id} className="border-l-2 border-border pl-3 text-sm">
                      <p className="text-foreground/80">{entry.workOrderNumber} · {entry.incidentType}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(entry.completedOn)}{entry.assetName ? ` · ${entry.assetName}` : ''}</p>
                      <p className="mt-1 text-foreground/80">{entry.resolution}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}