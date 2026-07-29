import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkOrder } from '@/hooks/use-work-orders';
import { useAnswers, useCustomerUpdates, useFormSchema, useSubmitVisit, useWorkSession } from '@/hooks/use-capture';
import { assessCompleteness, setUserValue, type FieldValue, type FormValue } from '@/domain/form-schema';
import type { CustomerUpdateCandidate } from '@/domain/extraction';
import { FormRenderer } from '@/components/form-renderer';

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
  const submitVisit = useSubmitVisit(id, sessionId);

  const [answers, setAnswers] = useState<FieldValue[]>([]);
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  // Seed the editable copy once the stored answers arrive; edits stay local
  // until submit so a background refetch cannot overwrite them mid-review.
  useEffect(() => {
    if (!answersLoading) setAnswers(storedAnswers);
  }, [answersLoading, storedAnswers]);

  const completeness = useMemo(
    () => (schema ? assessCompleteness(schema, answers) : null),
    [schema, answers],
  );

  const setValue = (name: string, value: FormValue) => {
    setAnswers((current) => setUserValue(current, name, value));
  };

  const acceptedUpdates = proposedUpdates.filter((_, index) => !rejected.has(index));

  const toggleUpdate = (index: number) => {
    setRejected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (submitVisit.isSuccess) {
    // Read the counts back from the submission itself: the session is closed by
    // now, so the queries that fed the form are deliberately empty.
    const submitted = submitVisit.variables.acceptedUpdates.length;
    return (
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <p className="text-lg font-medium text-slate-900">工单已提交</p>
        <p className="text-sm text-slate-500">
          {workOrder?.number} 已关闭{submitted > 0 ? `，并更新了 ${submitted} 条客户信息` : ''}。
        </p>
        <button type="button" onClick={() => navigate('/')} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
          返回工单列表
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 bg-slate-50 p-4">
      <Link to={`/work-orders/${id}/capture`} className="text-sm text-blue-600">
        ← 返回现场记录
      </Link>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h1 className="font-semibold text-slate-900">提交前确认</h1>
        <p className="mt-1 text-sm text-slate-500">
          {workOrder?.number} · {schema?.title ?? '加载中…'}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          标有「建议」的内容由系统整理，请核对后再提交；直接修改即可覆盖。
        </p>
      </section>

      {schema && (
        <FormRenderer
          schema={schema}
          values={answers}
          onChange={setValue}
          context={{ workOrderId: id, customerName: workOrder?.customerName }}
        />
      )}

      {proposedUpdates.length > 0 && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-900">客户信息更新</h2>
          <p className="mt-1 text-xs text-slate-500">这些内容会写回客户档案，供下次到访参考。</p>
          <ul className="mt-3 flex flex-col gap-2">
            {proposedUpdates.map((update, index) => {
              const accepted = !rejected.has(index);
              return (
                <li
                  key={`${update.field}-${index}`}
                  className={`rounded-lg p-3 ring-1 ${accepted ? 'bg-emerald-50 ring-emerald-200' : 'bg-slate-50 ring-slate-200'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">{UPDATE_LABELS[update.field]}</p>
                      <p className="mt-0.5 text-sm text-slate-800">{update.value}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleUpdate(index)}
                      className={`shrink-0 rounded px-2 py-1 text-xs ${
                        accepted ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                      }`}
                    >
                      {accepted ? '采纳' : '已忽略'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        {completeness && !completeness.submittable && (
          <p className="mb-2 text-sm text-amber-700">
            还缺 {completeness.missingRequired.map((f) => f.label).join('、')}，补齐后才能提交。
          </p>
        )}
        <button
          type="button"
          disabled={!completeness?.submittable || submitVisit.isPending || !sessionId}
          onClick={() => submitVisit.mutate({ answers, acceptedUpdates })}
          className="w-full rounded-lg bg-slate-900 py-3 text-sm text-white disabled:opacity-40"
        >
          {submitVisit.isPending ? '提交中…' : '确认提交'}
        </button>
        {submitVisit.isError && <p className="mt-2 text-sm text-rose-600">提交失败，请重试。</p>}
      </section>
    </div>
  );
}
