import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkOrder } from '@/hooks/use-work-orders';
import { useAnswers, useAppendEvidence, useEvidence, useFormSchema, usePrefillOnce, useRunExtraction, useWorkSession } from '@/hooks/use-capture';
import { useDictation } from '@/hooks/use-dictation';
import { assessCompleteness } from '@/domain/form-schema';
import { fileToDownscaledDataUrl } from '@/lib/image';

export function CapturePage() {
  const { id = '' } = useParams();
  const { data: workOrder } = useWorkOrder(id);
  const isClosed = workOrder?.status === 'completed';
  const { data: session } = useWorkSession(id, !isClosed);
  const sessionId = session?.id;

  const { data: evidence = [] } = useEvidence(sessionId);
  const { data: answers = [] } = useAnswers(sessionId);
  const appendEvidence = useAppendEvidence(sessionId);
  const runExtraction = useRunExtraction(id, sessionId);

  const [note, setNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dictation = useDictation((transcript) => {
    appendEvidence.mutate({ kind: 'voice', text: transcript });
  });

  const { data: schema } = useFormSchema(id);
  const unsupportedPrefills = usePrefillOnce(id, sessionId, schema);

  const completeness = useMemo(
    () => (schema ? assessCompleteness(schema, answers) : null),
    [schema, answers],
  );

  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    appendEvidence.mutate({ kind: 'text', text });
    setNote('');
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    const image = await fileToDownscaledDataUrl(file);
    appendEvidence.mutate({ kind: 'photo', image, text: file.name });
  };

  if (isClosed) {
    return (
      <div className="app-shell mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-foreground">该工单已提交关闭。</p>
        <Link to="/" className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
          返回工单列表
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-4">
      <Link to={`/work-orders/${id}`} className="text-sm text-primary">
        ← 返回工单
      </Link>

      <section className="glass-card p-4 shadow-sm">
        <h1 className="font-semibold text-foreground">
          现场记录{workOrder ? ` · ${workOrder.customerName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workOrder?.number} · {schema?.title ?? '加载中…'}
        </p>

        {unsupportedPrefills.length > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            表单中有 {unsupportedPrefills.length} 个自动带入规则当前版本不支持，需手工填写。
          </p>
        )}

        {completeness && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-foreground/80">
              信息完整度 {completeness.answeredRequired}/{completeness.totalRequired}
            </span>
            <span className={completeness.submittable ? 'text-emerald-600' : 'text-amber-600'}>
              {completeness.submittable ? '必填项已齐全' : '仍有必填项缺失'}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${completeness.submittable ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.round(completeness.ratio * 100)}%` }}
            />
          </div>
          {completeness.missingRequired.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {completeness.missingRequired.map((field) => (
                <li key={field.name} className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                  缺 {field.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
      </section>

      <section className="glass-card p-4 shadow-sm">
        <h2 className="font-medium text-foreground">随手记录</h2>
        <p className="mt-1 text-xs text-muted-foreground">想到什么记什么，稍后由系统整理进工单。</p>

        <div className="mt-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            placeholder="例如：报警代码 E-12，电导率 13.8"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addNote();
            }}
          />
          <button type="button" onClick={addNote} className="rounded-lg bg-primary px-3 text-sm text-primary-foreground">
            添加
          </button>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-card px-3 py-1.5 text-sm text-foreground ring-1 ring-border"
          >
            拍照
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              void addPhoto(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${
                dictation.listening
                  ? 'bg-rose-600 text-white ring-rose-600'
                  : 'bg-card text-foreground ring-border'
              }`}
            >
              {dictation.listening ? '停止录音' : '语音记录'}
            </button>
          )}
        </div>
      </section>

      <section className="glass-card p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium text-foreground">已采集 ({evidence.length})</h2>
          <button
            type="button"
            disabled={evidence.length === 0 || runExtraction.isPending}
            onClick={() => runExtraction.mutate()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          >
            {runExtraction.isPending ? '整理中…' : '整理进工单'}
          </button>
        </div>

        {runExtraction.data && (
          <p className="mt-2 text-xs text-muted-foreground">
            已填入 {runExtraction.data.fields.length} 个字段
            {runExtraction.data.customerUpdates.length > 0
              ? `，另发现 ${runExtraction.data.customerUpdates.length} 条客户信息更新`
              : ''}
          </p>
        )}

        {evidence.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">还没有记录。</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {evidence.map((item) => (
              <li key={item.id} className="flex gap-3 border-l-2 border-border pl-3">
                <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                  {new Date(item.capturedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="min-w-0">
                  {item.image && (
                    <img src={item.image} alt="现场照片" className="mb-1 max-h-40 rounded-lg object-contain" />
                  )}
                  {item.text && <p className="text-sm text-foreground/80">{item.text}</p>}
                  <span className="text-xs text-muted-foreground">
                    {item.kind === 'voice' ? '语音' : item.kind === 'photo' ? '照片' : '文字'}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link
        to={`/work-orders/${id}/review`}
        className="rounded-xl bg-primary py-3 text-center text-sm text-primary-foreground"
      >
        查看并提交工单
      </Link>
    </div>
  );
}
