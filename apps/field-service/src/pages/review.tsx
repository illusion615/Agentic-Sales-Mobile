import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkOrder } from '@/hooks/use-work-orders';
import {
  useAnswers,
  useCustomerUpdates,
  useFormSchema,
  useSubmitVisit,
  useVisitSummary,
  useWorkSession,
} from '@/hooks/use-capture';
import { assessCompleteness, confirmValue, setUserValue, type FieldValue, type FormValue } from '@/domain/form-schema';
import { reviewSections, sectionsNeedingAttention } from '@/domain/review';
import type { CustomerUpdateCandidate } from '@/domain/extraction';
import { ReviewSectionCard } from '@/components/review-section';

const UPDATE_LABELS: Record<CustomerUpdateCandidate['field'], string> = {
  siteAccessNotes: '进入与门禁',
  caution: '注意事项',
  contact: '联系人',
};

export function ReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const { data: workOrder } = useWorkOrder(id);
  const isClosed = workOrder?.status === 'completed';
  const { data: session } = useWorkSession(id, !isClosed);
  const sessionId = session?.id;

  const { data: schema } = useFormSchema(id);
  const { data: storedAnswers = [], isLoading: answersLoading } = useAnswers(sessionId);
  const { data: proposedUpdates = [] } = useCustomerUpdates(sessionId);
  const summaryQuery = useVisitSummary(id, sessionId);
  const summary = summaryQuery.data;
  const submitVisit = useSubmitVisit(id, sessionId);

  const [answers, setAnswers] = useState<FieldValue[]>([]);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const seeded = useRef(false);

  // Seed the editable copy once the stored answers arrive; edits stay local
  // until submit so a background refetch cannot overwrite them mid-review.
  //
  // Open state is decided here too, from the SAME data, because deciding it in
  // a separate effect would run against the empty form of the first render and
  // leave a section that wants attention sitting closed. After this it is the
  // technician's: a section must never close under them because their own
  // typing settled it.
  useEffect(() => {
    if (answersLoading) return;
    setAnswers(storedAnswers);
    if (!seeded.current && schema) {
      seeded.current = true;
      const initial = reviewSections(schema, storedAnswers);
      setOpenMap(Object.fromEntries(initial.map((r) => [r.section.key, r.defaultOpen])));
    }
  }, [answersLoading, storedAnswers, schema]);

  const reviews = useMemo(() => (schema ? reviewSections(schema, answers) : []), [schema, answers]);
  const completeness = useMemo(() => (schema ? assessCompleteness(schema, answers) : null), [schema, answers]);
  const attention = sectionsNeedingAttention(reviews);

  const setValue = (name: string, value: FormValue) => setAnswers((current) => setUserValue(current, name, value));
  const confirm = (name: string) => setAnswers((current) => confirmValue(current, name));
  const confirmMany = (names: string[]) =>
    setAnswers((current) => names.reduce((acc, name) => confirmValue(acc, name), current));

  const jumpToAttention = () => {
    const target = attention[0];
    if (!target) return;
    setOpenMap((current) => ({ ...current, [target.section.key]: true }));
    document.getElementById(`section-${target.section.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const acceptedUpdates = proposedUpdates.filter((_, index) => !rejected.has(index));

  if (submitVisit.isSuccess) {
    const submitted = submitVisit.variables.acceptedUpdates.length;
    return (
      <div className="app-shell mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
        <p className="text-lg font-medium text-foreground">工单已提交</p>
        <p className="text-sm text-muted-foreground">
          {workOrder?.number} 已关闭{submitted > 0 ? `，并更新了 ${submitted} 条客户信息` : ''}。
        </p>
        <button type="button" onClick={() => navigate('/')} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
          返回工单列表
        </button>
      </div>
    );
  }

  const percent = Math.round((completeness?.ratio ?? 0) * 100);

  return (
    <div className="app-shell min-h-full">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to={`/work-orders/${id}/capture`} className="text-sm text-muted-foreground">
              ← 现场记录
            </Link>
            {attention.length > 0 ? (
              <button type="button" onClick={jumpToAttention} className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
                还有 {attention.length} 处待处理 →
              </button>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">全部就绪</span>
            )}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-500 ${completeness?.submittable ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
        <section className="rounded-2xl bg-gradient-to-br from-primary to-accent p-4 text-primary-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-medium tracking-wide text-white/70">本次服务摘要</h1>
            {summaryQuery.isError && (
              <button
                type="button"
                onClick={() => void summaryQuery.refetch()}
                className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] text-white"
              >
                重试
              </button>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            {summaryQuery.isError
              ? 'AI 暂时不可用，没能写出摘要。下面的内容完整，不影响提交。'
              : (summary?.text ?? '正在整理…')}
          </p>
          {summary && summary.highlights.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {summary.highlights.map((item) => (
                <li key={item} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/90">
                  {item}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-white/50">
            {workOrder?.number} · {schema?.title ?? ''}
          </p>
        </section>

        {reviews.map((review) => (
          <ReviewSectionCard
            key={review.section.key}
            review={review}
            values={answers}
            open={openMap[review.section.key] ?? review.defaultOpen}
            onToggle={() =>
              setOpenMap((current) => ({
                ...current,
                [review.section.key]: !(current[review.section.key] ?? review.defaultOpen),
              }))
            }
            onChange={setValue}
            onConfirm={confirm}
            onConfirmSection={confirmMany}
            context={{ workOrderId: id, customerName: workOrder?.customerName }}
          />
        ))}

        {proposedUpdates.length > 0 && (
          <section className="glass-card p-4 shadow-sm">
            <h2 className="font-medium text-foreground">客户档案更新</h2>
            <p className="mt-1 text-xs text-muted-foreground">这些内容会写回客户档案，供下次到访参考。</p>
            <ul className="mt-3 flex flex-col gap-2">
              {proposedUpdates.map((update, index) => {
                const accepted = !rejected.has(index);
                return (
                  <li
                    key={`${update.field}-${index}`}
                    className={`rounded-xl p-3 ring-1 transition-colors ${
                      accepted ? 'bg-emerald-500/10 ring-emerald-500/25' : 'bg-muted ring-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{UPDATE_LABELS[update.field]}</p>
                        <p className={`mt-0.5 text-sm ${accepted ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                          {update.value}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setRejected((current) => {
                            const next = new Set(current);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })
                        }
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                          accepted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-card text-muted-foreground ring-1 ring-border'
                        }`}
                      >
                        {accepted ? '✓ 采纳' : '已忽略'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-6">
          {completeness && !completeness.submittable && (
            <p className="mb-2 text-center text-xs text-amber-700">
              还缺 {completeness.missingRequired.map((f) => f.label).join('、')}
            </p>
          )}
          <button
            type="button"
            disabled={!completeness?.submittable || submitVisit.isPending || !sessionId}
            onClick={() => submitVisit.mutate({ answers, acceptedUpdates })}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-black/10 transition-opacity disabled:opacity-40"
          >
            {submitVisit.isPending ? '提交中…' : '确认提交'}
          </button>
          {submitVisit.isError && <p className="mt-2 text-center text-sm text-rose-600">提交失败，请重试。</p>}
        </div>
      </div>
    </div>
  );
}
