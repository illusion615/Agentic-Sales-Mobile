import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, DoorOpen, Phone } from 'lucide-react';
import { useCustomer } from '@/hooks/use-work-orders';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * The customer behind the job.
 *
 * Deliberately a page of its own rather than a tab of the work order: this
 * context outlives any single visit, and it is what the capture flow proposes
 * updates to. A technician who arrives and finds the access rules changed
 * should be able to reach it from anywhere, not only from the job they happen
 * to be standing in.
 */
export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useCustomer(id);

  if (isLoading) return <PageShell><p className="text-sm text-muted-foreground">加载中…</p></PageShell>;
  if (isError || !data) return <PageShell><p className="text-sm text-rose-600">客户不存在或加载失败。</p></PageShell>;

  const { profile, history } = data;

  return (
    <PageShell>
      <section className="glass-card p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{profile.name}</h1>
        {profile.industry && <p className="mt-1 text-sm text-muted-foreground">{profile.industry}</p>}
      </section>

      {(profile.siteAccessNotes || (profile.cautions?.length ?? 0) > 0) && (
        <section className="glass-card p-4 shadow-sm">
          <h2 className="font-medium text-foreground">现场须知</h2>
          {profile.siteAccessNotes && (
            <p className="mt-2 flex gap-2 text-sm text-foreground/80">
              <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              {profile.siteAccessNotes}
            </p>
          )}
          {profile.cautions?.map((caution) => (
            <p key={caution} className="mt-2 flex gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {caution}
            </p>
          ))}
        </section>
      )}

      {profile.contacts.length > 0 && (
        <section className="glass-card p-4 shadow-sm">
          <h2 className="font-medium text-foreground">联系人</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {profile.contacts.map((contact) => (
              <li key={`${contact.name}-${contact.phone ?? ''}`} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate text-foreground/80">
                  {contact.name}
                  {contact.role && <span className="text-muted-foreground"> · {contact.role}</span>}
                </span>
                {contact.phone && (
                  <a className="flex shrink-0 items-center gap-1 text-primary" href={`tel:${contact.phone}`}>
                    <Phone className="h-3.5 w-3.5" />
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
                  <span className="ml-2 text-xs text-muted-foreground">
                    {entry.workOrderNumber} · {formatDate(entry.completedOn)}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{entry.resolution}</p>
                {(entry.technicianName || entry.assetName) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[entry.assetName, entry.technicianName].filter(Boolean).join(' · ')}
                  </p>
                )}
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
