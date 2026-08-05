import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, FileText, LockKeyhole, Mail, PenLine, Printer } from 'lucide-react';
import { useWorkOrder } from '@/hooks/use-work-orders';
import { useAcceptance, useSaveAcceptance } from '@/hooks/use-acceptance';
import {
  acceptanceLocked,
  acceptanceReadyToSign,
  acceptanceContentHash,
  acceptanceTemplate,
  acceptanceTemplateId,
  type AcceptanceItemResult,
  type AcceptanceRecord,
  type ChecklistResult,
} from '@/domain/acceptance';
import { SignaturePad } from '@/components/signature-pad';

const RESULT_LABELS: Record<ChecklistResult, string> = {
  pass: '合格',
  fail: '不合格',
  'not-applicable': '不适用',
};

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function AcceptancePage() {
  const { id = '' } = useParams();
  const { data: workOrder } = useWorkOrder(id);
  const templateId = workOrder ? acceptanceTemplateId(workOrder.incidentType) : undefined;
  const acceptanceQuery = useAcceptance(id, templateId);
  const saveAcceptance = useSaveAcceptance(id);
  const [record, setRecord] = useState<AcceptanceRecord>();
  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('仪器负责人');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  useEffect(() => {
    if (acceptanceQuery.data) setRecord(acceptanceQuery.data);
  }, [acceptanceQuery.data]);

  const ready = record ? acceptanceReadyToSign(record) : false;
  const template = useMemo(() => acceptanceTemplate(record?.templateId ?? templateId ?? 'repair-guidance@1'), [record?.templateId, templateId]);
  const failed = useMemo(
    () => record?.items.filter((item) => item.result === 'fail').length ?? 0,
    [record],
  );
  const missingAttachments = useMemo(
    () => template.filter((definition) => {
      if (!definition.requiredAttachment) return false;
      const item = record?.items.find((result) => result.itemId === definition.id);
      return !item?.attachmentDataUrl;
    }).length,
    [record, template],
  );

  const commit = (next: AcceptanceRecord) => {
    setRecord(next);
    saveAcceptance.mutate(next);
  };

  const updateItem = (itemId: string, update: Partial<AcceptanceItemResult>) => {
    if (!record || acceptanceLocked(record)) return;
    const current = record.items.find((item) => item.itemId === itemId) ?? { itemId };
    commit({
      ...record,
      items: [...record.items.filter((item) => item.itemId !== itemId), { ...current, ...update }],
    });
  };

  if (!record || !workOrder) {
    return <div className="app-shell p-6 text-sm text-muted-foreground">正在准备验收单…</div>;
  }

  const signed = acceptanceLocked(record);

  const downloadReport = () => {
    const rows = template.map((definition) => {
      const item = record.items.find((result) => result.itemId === definition.id);
      return `<tr><td>${escapeHtml(definition.service)}</td><td>${escapeHtml(definition.standard)}</td><td>${escapeHtml(item?.result ? RESULT_LABELS[item.result] : '')}</td><td>${escapeHtml(item?.note)}</td></tr>`;
    }).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(workOrder.number)} 维修验收报告</title><style>body{font:14px sans-serif;margin:32px;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:8px;text-align:left}img{max-width:260px}</style><h1>维修验收报告</h1><p>客户：${escapeHtml(workOrder.customerName)}</p><p>工单：${escapeHtml(workOrder.number)} · ${escapeHtml(workOrder.incidentType)}</p><table><thead><tr><th>服务内容</th><th>执行标准</th><th>结果</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table><h2>客户反馈</h2><p>${escapeHtml(record.customerFeedback || '无')}</p><h2>客户签字</h2>${record.signature ? `<p>${escapeHtml(record.signature.signerName)} · ${escapeHtml(record.signature.signerRole)} · ${escapeHtml(new Date(record.signature.signedAt).toLocaleString('zh-CN'))}</p><img src="${record.signature.image}">` : ''}`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${workOrder.number}-维修验收报告.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-shell min-h-full bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link to={`/work-orders/${id}/review`} className="text-xs text-muted-foreground">← 完成检查</Link>
            <h1 className="mt-0.5 font-semibold text-foreground">客户维修验收</h1>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs ${signed ? 'bg-emerald-500/12 text-emerald-700' : 'bg-amber-500/12 text-amber-700'}`}>
            {record.status === 'draft' ? '待客户验收' : record.status === 'signed' ? '已签署' : '报告待发送'}
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-3">
          <section className="glass-card p-4 shadow-sm">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">客户：</span>{workOrder.customerName}</p>
              <p><span className="text-muted-foreground">工单：</span>{workOrder.number}</p>
              <p><span className="text-muted-foreground">设备：</span>{workOrder.assetName ?? '未登记'}</p>
              <p><span className="text-muted-foreground">服务类型：</span>{workOrder.incidentType ?? '维修服务'}</p>
            </div>
          </section>

          {template.map((definition, index) => {
            const item = record.items.find((result) => result.itemId === definition.id);
            return (
              <section key={definition.id} className="glass-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-medium text-foreground">{definition.service}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{definition.standard}</p>
                  </div>
                  {signed && <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 pl-9">
                  {(Object.keys(RESULT_LABELS) as ChecklistResult[]).map((result) => (
                    <button key={result} type="button" disabled={signed} onClick={() => updateItem(definition.id, { result })} className={`rounded-full px-3 py-1 text-xs ring-1 disabled:opacity-70 ${item?.result === result ? result === 'fail' ? 'bg-rose-600 text-white ring-rose-600' : 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-muted-foreground ring-border'}`}>
                      {RESULT_LABELS[result]}
                    </button>
                  ))}
                </div>
                {item?.result === 'fail' && (
                  <textarea disabled={signed} value={item.note ?? ''} onChange={(event) => updateItem(definition.id, { note: event.target.value })} placeholder="请填写不合格情况和后续处理" className="mt-3 ml-9 min-h-20 w-[calc(100%-2.25rem)] rounded-lg border border-rose-300 bg-card p-2 text-sm outline-none focus:border-rose-500" />
                )}
                {definition.requiredAttachment && (
                  <div className="mt-3 ml-9 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">附件：{definition.requiredAttachment}</span>
                    {!signed && <label className="cursor-pointer rounded-lg px-2 py-1 text-primary ring-1 ring-border">{item?.attachmentName ?? '选择文件'}<input type="file" className="hidden" accept="image/*,.pdf" onChange={async (event) => { const file = event.target.files?.[0]; if (file) updateItem(definition.id, { attachmentName: file.name, attachmentDataUrl: await fileDataUrl(file) }); }} /></label>}
                    {signed && item?.attachmentName && <span className="text-foreground">{item.attachmentName}</span>}
                  </div>
                )}
              </section>
            );
          })}
        </main>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <section className="glass-card p-4 shadow-sm">
            <h2 className="font-medium text-foreground">客户评价</h2>
            <div className="mt-3 flex gap-2">
              {([['satisfied', '满意'], ['neutral', '一般'], ['dissatisfied', '不满意']] as const).map(([value, label]) => (
                <button key={value} type="button" disabled={signed} onClick={() => commit({ ...record, customerRating: value })} className={`rounded-full px-3 py-1 text-xs ring-1 ${record.customerRating === value ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-muted-foreground ring-border'}`}>{label}</button>
              ))}
            </div>
            <textarea disabled={signed} value={record.customerFeedback ?? ''} onChange={(event) => commit({ ...record, customerFeedback: event.target.value })} placeholder="客户意见及建议" className="mt-3 min-h-24 w-full rounded-lg border border-border bg-card p-2 text-sm outline-none focus:border-primary" />
          </section>

          {!signed && !signing && (
            <section className="glass-card p-4 shadow-sm">
              <h2 className="font-medium text-foreground">完成情况</h2>
              <p className="mt-2 text-sm text-muted-foreground">已完成 {record.items.filter((item) => item.result).length} / {template.length} 项{failed > 0 ? `，${failed} 项不合格` : ''}{missingAttachments > 0 ? `，缺 ${missingAttachments} 个附件` : ''}</p>
              <button type="button" disabled={!ready} onClick={() => setSigning(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"><PenLine className="h-4 w-4" />请客户签字</button>
            </section>
          )}

          {!signed && signing && (
            <section className="glass-card p-4 shadow-sm">
              <h2 className="font-medium text-foreground">客户确认签字</h2>
              <p className="mt-1 text-xs text-muted-foreground">签字表示客户已查看上述服务结果。签字后内容将锁定。</p>
              <input value={signerName} onChange={(event) => setSignerName(event.target.value)} placeholder="签署人姓名" className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
              <input value={signerRole} onChange={(event) => setSignerRole(event.target.value)} placeholder="职务" className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
              <div className="mt-3"><SignaturePad onChange={setSignatureImage} /></div>
              <button type="button" disabled={!signerName.trim() || !signatureImage} onClick={async () => commit({ ...record, status: 'signed', signature: { signerName: signerName.trim(), signerRole: signerRole.trim(), signedAt: new Date().toISOString(), consentVersion: '1.0', contentHash: await acceptanceContentHash(record), image: signatureImage! } })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"><Check className="h-4 w-4" />确认签署</button>
            </section>
          )}

          {signed && (
            <section className="glass-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-700"><Check className="h-4 w-4" /><h2 className="font-medium">客户已签署</h2></div>
              <p className="mt-2 text-sm text-foreground">{record.signature?.signerName} · {record.signature?.signerRole}</p>
              {record.signature?.contentHash && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={record.signature.contentHash}>内容指纹：{record.signature.contentHash.slice(0, 16)}…</p>}
              <img src={record.signature?.image} alt="客户签名" className="mt-2 h-20 w-full rounded-lg border border-border bg-white object-contain" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => window.print()} className="flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ring-1 ring-border"><Printer className="h-3.5 w-3.5" />打印/PDF</button>
                <button type="button" onClick={downloadReport} className="flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ring-1 ring-border"><FileText className="h-3.5 w-3.5" />下载报告</button>
              </div>
              <label className="mt-4 block text-xs text-muted-foreground">客户收件邮箱<input type="email" value={record.recipientEmail ?? ''} onChange={(event) => setRecord({ ...record, recipientEmail: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary" /></label>
              <button type="button" disabled={!record.recipientEmail?.includes('@') || record.status === 'delivery-pending'} onClick={() => commit({ ...record, status: 'delivery-pending', deliveryRequestedAt: new Date().toISOString() })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"><Mail className="h-4 w-4" />{record.status === 'delivery-pending' ? '已记录发送请求' : '生成并发送报告'}</button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
