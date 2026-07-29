import { Link, useParams } from 'react-router-dom';
import { useWorkOrderBriefing } from '@/hooks/use-work-orders';
import { assessSla } from '@/domain/scheduling';
import { navigationUrl } from '@/lib/navigation';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useWorkOrderBriefing(id);

  if (isLoading) return <PageShell><p className="text-sm text-slate-500">加载中…</p></PageShell>;
  if (isError || !data) return <PageShell><p className="text-sm text-rose-600">工单不存在或加载失败。</p></PageShell>;

  const { workOrder, customer, history, briefing } = data;
  const sla = assessSla(workOrder);

  return (
    <PageShell>
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{customer.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {workOrder.number} · {workOrder.incidentType ?? '未分类'}
        </p>
        <p className="mt-1 text-sm text-slate-500">{workOrder.address.line1}</p>
        {workOrder.slaDueBy && (
          <p className="mt-2 text-sm text-slate-700">
            SLA 截止 {new Date(workOrder.slaDueBy).toLocaleString('zh-CN')}
            {sla.minutesRemaining !== null && sla.minutesRemaining < 0 && (
              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">已超时</span>
            )}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <a
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
            href={navigationUrl(workOrder.address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            导航前往
          </a>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium text-slate-900">服务前简报</h2>
          <span className="text-xs text-slate-400">
            {briefing.source === 'ai' ? 'AI 生成' : '按记录整理'}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{briefing.background}</p>

        {briefing.watchOuts.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium text-amber-700">注意事项</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
              {briefing.watchOuts.map((item) => (
                <li key={item} className="mt-1">{item}</li>
              ))}
            </ul>
          </>
        )}

        {briefing.preparation.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium text-emerald-700">出发前准备</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
              {briefing.preparation.map((item) => (
                <li key={item} className="mt-1">{item}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {customer.contacts.length > 0 && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-900">现场联系人</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {customer.contacts.map((contact) => (
              <li key={contact.name} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {contact.name}
                  {contact.role && <span className="text-slate-400"> · {contact.role}</span>}
                </span>
                {contact.phone && (
                  <a className="text-blue-600" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-medium text-slate-900">历史服务记录</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">该客户暂无历史记录。</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-3">
            {history.map((entry) => (
              <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm text-slate-900">
                  {entry.incidentType}
                  <span className="ml-2 text-xs text-slate-400">{formatDate(entry.completedOn)}</span>
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{entry.resolution}</p>
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
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 bg-slate-50 p-4">
      <Link to="/" className="text-sm text-blue-600">
        ← 返回工单列表
      </Link>
      {children}
    </div>
  );
}
