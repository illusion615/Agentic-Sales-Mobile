import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStartWorkOrder, useWorkOrderBriefing } from '@/hooks/use-work-orders';
import { assessSla } from '@/domain/scheduling';
import { navigationUrl } from '@/lib/navigation';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const startWorkOrder = useStartWorkOrder(id);
  const { data, isLoading, isError } = useWorkOrderBriefing(id);

  if (isLoading) return <PageShell><p className="text-sm text-muted-foreground">加载中…</p></PageShell>;
  if (isError || !data) return <PageShell><p className="text-sm text-rose-600">工单不存在或加载失败。</p></PageShell>;

  const { workOrder, customer, history, briefing } = data;
  const sla = assessSla(workOrder);

  return (
    <PageShell>
      <section className="glass-card p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{customer.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workOrder.number} · {workOrder.incidentType ?? '未分类'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{workOrder.address.line1}</p>
        {workOrder.slaDueBy && (
          <p className="mt-2 text-sm text-foreground/80">
            SLA 截止 {new Date(workOrder.slaDueBy).toLocaleString('zh-CN')}
            {sla.minutesRemaining !== null && sla.minutesRemaining < 0 && (
              <span className="ml-2 rounded bg-rose-500/12 px-1.5 py-0.5 text-xs text-rose-600 dark:text-rose-300">已超时</span>
            )}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await startWorkOrder.mutateAsync();
              navigate(`/work-orders/${workOrder.id}/capture`);
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
            disabled={startWorkOrder.isPending}
          >
            {workOrder.status === 'in-progress' ? '继续服务' : '开始服务'}
          </button>
          <a
            className="rounded-lg bg-card px-3 py-1.5 text-sm text-foreground ring-1 ring-border"
            href={navigationUrl(workOrder.address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            导航前往
          </a>
        </div>
      </section>

      <section className="glass-card p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium text-foreground">服务前简报</h2>
          <span className="text-xs text-muted-foreground">
            {briefing.source === 'ai' ? 'AI 生成' : '按记录整理'}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{briefing.background}</p>

        {briefing.watchOuts.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium text-amber-700">注意事项</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-foreground/80">
              {briefing.watchOuts.map((item) => (
                <li key={item} className="mt-1">{item}</li>
              ))}
            </ul>
          </>
        )}

        {briefing.preparation.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium text-emerald-700">出发前准备</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-foreground/80">
              {briefing.preparation.map((item) => (
                <li key={item} className="mt-1">{item}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {customer.contacts.length > 0 && (
        <section className="glass-card p-4 shadow-sm">
          <h2 className="font-medium text-foreground">现场联系人</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {customer.contacts.map((contact) => (
              <li key={contact.name} className="flex items-center justify-between text-sm">
                <span className="text-foreground/80">
                  {contact.name}
                  {contact.role && <span className="text-muted-foreground"> · {contact.role}</span>}
                </span>
                {contact.phone && (
                  <a className="text-primary" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass-card p-4 shadow-sm">
        <h2 className="font-medium text-foreground">历史服务记录</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">该客户暂无历史记录。</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-3">
            {history.map((entry) => (
              <li key={entry.id} className="border-l-2 border-border pl-3">
                <p className="text-sm text-foreground">
                  {entry.incidentType}
                  <span className="ml-2 text-xs text-muted-foreground">{formatDate(entry.completedOn)}</span>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{entry.resolution}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-4">
      <Link to="/" className="text-sm text-primary">
        ← 返回工单列表
      </Link>
      {children}
    </div>
  );
}
