import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, Loader2, Mic, Send, Square } from 'lucide-react';
import { useWorkOrder } from '@/hooks/use-work-orders';
import {
  useAnswers,
  useAppendEvidence,
  useEvidence,
  useFormSchema,
  usePrefillOnce,
  useRunExtraction,
  useSaveAnswers,
  useWorkSession,
} from '@/hooks/use-capture';
import { useDictation } from '@/hooks/use-dictation';
import { captureProgress, type CaptureStage } from '@/domain/capture-progress';
import { confirmValue, setUserValue, type FormValue } from '@/domain/form-schema';
import type { Evidence } from '@/domain/capture';
import { reviewSections } from '@/domain/review';
import { ReviewSectionCard } from '@/components/review-section';
import { fileToDownscaledDataUrl } from '@/lib/image';

const STAGE_TONE: Record<CaptureStage, { bar: string; text: string }> = {
  blank: { bar: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
  gathering: { bar: 'bg-amber-500', text: 'text-amber-700' },
  nearly: { bar: 'bg-primary', text: 'text-primary' },
  ready: { bar: 'bg-emerald-500', text: 'text-emerald-600' },
};

export function CapturePage() {
  const { id = '' } = useParams();
  const { data: workOrder } = useWorkOrder(id);
  const isClosed = workOrder?.status === 'completed';
  const { data: session } = useWorkSession(id, !isClosed);
  const sessionId = session?.id;

  const { data: evidence = [] } = useEvidence(sessionId);
  const { data: answers = [], isLoading: answersLoading } = useAnswers(sessionId);
  const appendEvidence = useAppendEvidence(sessionId);
  const saveAnswers = useSaveAnswers(sessionId);
  const runExtraction = useRunExtraction(id, sessionId);

  const [note, setNote] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  const { data: schema } = useFormSchema(id);
  const unsupportedPrefills = usePrefillOnce(id, sessionId, schema);

  // Which sections start open is decided once, from what the form wants at the
  // time it opens. After that it belongs to the technician: a section must
  // never close under them just because their own answer settled it.
  useEffect(() => {
    if (answersLoading || !schema || seeded.current) return;
    seeded.current = true;
    setOpenMap(
      Object.fromEntries(reviewSections(schema, answers).map((r) => [r.section.key, r.defaultOpen])),
    );
  }, [answersLoading, schema, answers]);

  const progress = useMemo(
    () => (workOrder && schema ? captureProgress(workOrder, schema, answers) : null),
    [workOrder, schema, answers],
  );
  const reviews = useMemo(() => (schema ? reviewSections(schema, answers) : []), [schema, answers]);

  /**
   * Capture, then read. The fragment must be stored before extraction can see
   * it; extraction only fills what is still blank, so nothing already entered
   * here is ever overwritten by it.
   *
   * A failed read is not a failed capture — the note is already saved, so the
   * error is reported and the reading can be retried against everything
   * captured so far.
   */
  const record = async (input: Omit<Evidence, 'id' | 'sessionId' | 'capturedAt'>) => {
    if (!sessionId) return;
    await appendEvidence.mutateAsync(input);
    try {
      await runExtraction.mutateAsync();
    } catch {
      /* reported in the composer; the note itself is safe */
    }
  };

  const dictation = useDictation((transcript) => {
    void record({ kind: 'voice', text: transcript });
  });

  const busy = appendEvidence.isPending || runExtraction.isPending;

  const addNote = () => {
    const text = note.trim();
    if (!text || busy) return;
    setNote('');
    void record({ kind: 'text', text });
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    const image = await fileToDownscaledDataUrl(file);
    await record({ kind: 'photo', image, text: file.name });
  };

  const setValue = (name: string, value: FormValue) =>
    saveAnswers.mutate(setUserValue(answers, name, value));
  const confirm = (name: string) => saveAnswers.mutate(confirmValue(answers, name));
  const confirmMany = (names: string[]) =>
    saveAnswers.mutate(names.reduce((acc, name) => confirmValue(acc, name), [...answers]));

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

  const tone = STAGE_TONE[progress?.stage ?? 'blank'];

  return (
    <div className="app-shell flex h-[100dvh] flex-col">
      <header className="shrink-0 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to={`/work-orders/${id}`} className="truncate text-sm text-muted-foreground">
              ← {workOrder?.customerName ?? '返回工单'}
            </Link>
            <Link
              to={`/work-orders/${id}/review`}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                progress?.submittable
                  ? 'bg-emerald-600 text-white'
                  : 'bg-card text-muted-foreground ring-1 ring-border'
              }`}
            >
              {progress?.submittable ? '去提交 →' : '查看工单 →'}
            </Link>
          </div>

          <p className={`mt-2 text-sm ${tone.text}`}>{progress?.headline ?? '正在打开表单…'}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-500 ${tone.bar}`}
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
          {unsupportedPrefills.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              表单中有 {unsupportedPrefills.length} 个自动带入规则当前版本不支持，需手工填写。
            </p>
          )}

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

          {evidence.length > 0 && (
            <section className="glass-card p-4 shadow-sm">
              <h2 className="text-sm font-medium text-foreground">原始记录 ({evidence.length})</h2>
              <p className="mt-1 text-xs text-muted-foreground">表单里的每一项都能追回到这里。</p>
              <ol className="mt-3 flex flex-col gap-3">
                {evidence.map((item) => (
                  <li key={item.id} className="flex gap-3 border-l-2 border-border pl-3">
                    <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                      {new Date(item.capturedAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <div className="min-w-0">
                      {item.image && (
                        <img src={item.image} alt="现场照片" className="mb-1 max-h-40 rounded-lg object-contain" />
                      )}
                      {item.text && <p className="text-sm text-foreground/80">{item.text}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {runExtraction.isError ? (
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-rose-600">
                AI 没能读取这条记录，内容已保存。表单仍可手填。
              </span>
              <button
                type="button"
                onClick={() => runExtraction.mutate()}
                disabled={busy}
                className="shrink-0 rounded-full bg-card px-2.5 py-0.5 text-rose-600 ring-1 ring-rose-300 disabled:opacity-40"
              >
                重试
              </button>
            </div>
          ) : (
            <p className="mb-2 h-4 truncate text-xs text-muted-foreground">
              {busy
                ? '正在让 AI 整理进表单…'
                : runExtraction.data
                  ? `AI 填入 ${runExtraction.data.fields.length} 个字段，请核对`
                  : '随手记录，AI 自动填进上面的表单'}
            </p>
          )}

          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="拍照"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            >
              <Camera className="h-5 w-5" />
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
                aria-label={dictation.listening ? '停止录音' : '语音记录'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  dictation.listening ? 'bg-rose-600 text-white' : 'text-muted-foreground'
                }`}
              >
                {dictation.listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
              </button>
            )}

            <textarea
              rows={1}
              className="mx-1 min-w-0 flex-1 resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              placeholder="例如：报警代码 E-12，已更换电导率传感器"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                // Enter records; Shift+Enter is how a multi-line remark is written.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  addNote();
                }
              }}
            />

            <button
              type="button"
              onClick={addNote}
              disabled={!note.trim() || busy}
              aria-label="记录"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
