import { useState } from 'react';
import { Pause, X } from 'lucide-react';
import { usePauseWorkOrder } from '@/hooks/use-work-orders';

const REASONS = ['等待备件', '等待客户配合', '转去处理紧急工单', '等待远程支持', '其他'] as const;

export function PauseWorkOrderDialog({
  workOrderId,
  open,
  onClose,
  onPaused,
}: {
  workOrderId: string;
  open: boolean;
  onClose: () => void;
  onPaused: () => void;
}) {
  const pauseWorkOrder = usePauseWorkOrder(workOrderId);
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');

  if (!open) return null;
  const finalReason = reason === '其他' ? details.trim() : [reason, details.trim()].filter(Boolean).join('：');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="pause-title" className="w-full max-w-md rounded-t-2xl bg-card p-4 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/12 text-amber-700"><Pause className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="pause-title" className="font-medium text-foreground">挂起当前工单</h2>
            <p className="text-xs text-muted-foreground">记录和问卷会保留，之后可以继续服务。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="flex h-8 w-8 items-center justify-center text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm text-foreground">挂起原因</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map((value) => (
              <button key={value} type="button" aria-pressed={reason === value} onClick={() => setReason(value)} className={`rounded-full px-3 py-1.5 text-sm ring-1 ${reason === value ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-muted-foreground ring-border'}`}>{value}</button>
            ))}
          </div>
        </fieldset>

        <textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder={reason === '其他' ? '请填写挂起原因' : '补充说明（可选）'} className="mt-3 min-h-20 w-full rounded-lg border border-border bg-card p-2 text-sm text-foreground outline-none focus:border-primary" />

        <button type="button" disabled={!finalReason || pauseWorkOrder.isPending} onClick={async () => { await pauseWorkOrder.mutateAsync(finalReason); onPaused(); }} className="mt-4 w-full rounded-xl bg-amber-600 py-3 text-sm font-medium text-white disabled:opacity-40">
          {pauseWorkOrder.isPending ? '正在挂起…' : '确认挂起并返回工单列表'}
        </button>
        {pauseWorkOrder.isError && <p className="mt-2 text-center text-xs text-rose-600">挂起失败，请重试。</p>}
      </section>
    </div>
  );
}
