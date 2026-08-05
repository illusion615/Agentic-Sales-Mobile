import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUp, Camera, ChevronUp, Loader2, Mic, Sparkles, Square } from 'lucide-react';
import { useBriefing, useWorkOrder, useWorkOrderBriefing } from '@/hooks/use-work-orders';
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
import { useWorkspaceLayout } from '@/hooks/use-workspace-layout';
import { captureProgress, type CaptureStage } from '@/domain/capture-progress';
import { captureComposerAction } from '@/domain/capture-composer';
import { lockAiValue, setUserValue, type FormValue } from '@/domain/form-schema';
import type { Evidence } from '@/domain/capture';
import { reviewSections } from '@/domain/review';
import { ReviewSectionCard } from '@/components/review-section';
import { CaptureContextPanel } from '@/components/capture-context-panel';
import { PauseWorkOrderDialog } from '@/components/pause-work-order-dialog';
import { fileToDownscaledDataUrl } from '@/lib/image';

const STAGE_TONE: Record<CaptureStage, { bar: string; text: string }> = {
  blank: { bar: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
  gathering: { bar: 'bg-amber-500', text: 'text-amber-700' },
  nearly: { bar: 'bg-primary', text: 'text-primary' },
  ready: { bar: 'bg-emerald-500', text: 'text-emerald-600' },
};

export function CapturePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: workOrder } = useWorkOrder(id);
  const workspaceLayout = useWorkspaceLayout();
  const { data: context } = useWorkOrderBriefing(id);
  const briefingQuery = useBriefing(id);
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
  const [copilotOpen, setCopilotOpen] = useState(() => workspaceLayout === 'desktop' || workspaceLayout === 'dual');
  const [contextOpen, setContextOpen] = useState(() => workspaceLayout === 'desktop' || workspaceLayout === 'dual');
  const [pauseOpen, setPauseOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
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
  * it. Extraction may revise unlocked AI content when this fragment corrects
  * it, but never overwrites technician-entered or locked values.
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

  const dictation = useDictation({ value: note, onChange: setNote });

  const busy = appendEvidence.isPending || runExtraction.isPending;
  const composerBusy = busy || dictation.transcribing;
  const composerAction = captureComposerAction({
    hasText: !!note.trim(),
    busy: composerBusy,
    listening: dictation.listening,
    speechSupported: dictation.supported,
  });

  useEffect(() => {
    const input = noteInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [note]);

  const addNote = () => {
    const text = note.trim();
    if (!text || composerBusy) return;
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
  const lock = (name: string) => saveAnswers.mutate(lockAiValue(answers, name));

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
    <div className="capture-workspace app-shell flex h-[100dvh] flex-col" data-workspace-layout={workspaceLayout}>
      <header className="capture-header shrink-0 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to={`/work-orders/${id}`} className="truncate text-sm text-muted-foreground">
              ← {workOrder?.customerName ?? '返回工单'}
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setPauseOpen(true)} className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-700 ring-1 ring-amber-300">挂起</button>
              <Link
                to={`/work-orders/${id}/review`}
                className={`rounded-full px-3 py-1 text-xs ${
                progress?.submittable
                  ? 'bg-emerald-600 text-white'
                  : 'bg-card text-muted-foreground ring-1 ring-border'
                }`}
              >
                {progress?.submittable ? '完成服务 →' : '完成检查 →'}
              </Link>
            </div>
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

      <aside className="capture-context min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="p-4">
          <CaptureContextPanel open={contextOpen} onToggle={() => setContextOpen((open) => !open)} workOrder={context?.workOrder ?? workOrder} customer={context?.customer} history={context?.history ?? []} briefing={briefingQuery.data} briefingPending={briefingQuery.isPending} briefingError={briefingQuery.isError} onRetryBriefing={() => void briefingQuery.refetch()} />
        </div>
      </aside>

      <main className="capture-form min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
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
              onLock={lock}
              context={{ workOrderId: id, customerName: workOrder?.customerName }}
            />
          ))}

        </div>
      </main>

      <footer className="capture-copilot shrink-0 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => setCopilotOpen((open) => !open)}
            aria-expanded={copilotOpen}
            className="flex w-full items-center gap-2 px-4 py-2 text-left"
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              runExtraction.phase === 'error'
                ? 'bg-rose-500/12 text-rose-600'
                : runExtraction.phase === 'done'
                  ? 'bg-emerald-500/12 text-emerald-600'
                  : 'bg-primary/10 text-primary'
            }`}>
              {runExtraction.isPending || appendEvidence.isPending || dictation.transcribing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground">
                {appendEvidence.isPending
                  ? '正在保存现场记录'
                  : dictation.transcribing
                    ? '正在识别语音'
                    : runExtraction.phase === 'reading'
                      ? '正在读取现场材料'
                      : runExtraction.phase === 'extracting'
                        ? 'AI 正在提取问卷信息'
                        : runExtraction.phase === 'writing'
                          ? '正在写入问卷'
                          : runExtraction.phase === 'done'
                            ? `已填入 ${runExtraction.data?.fields.length ?? 0} 个字段，请核对`
                            : runExtraction.phase === 'error'
                              ? 'AI 没能整理记录，内容已保存'
                              : evidence.length > 0
                                ? `${evidence.length} 条现场记录`
                                : '随手记录，AI 自动整理进问卷'}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {evidence.length > 0 ? '展开查看原始记录和处理状态' : '想到什么就记什么'}
              </span>
            </span>
            <ChevronUp className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${copilotOpen ? 'rotate-180' : ''}`} />
          </button>

          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${copilotOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <div className="max-h-[38dvh] overflow-y-auto border-t border-border/70 px-4 py-3">
                {runExtraction.phase === 'error' && (
                  <button
                    type="button"
                    onClick={() => runExtraction.mutate()}
                    disabled={busy}
                    className="mb-3 rounded-full bg-card px-3 py-1 text-xs text-rose-600 ring-1 ring-rose-300 disabled:opacity-40"
                  >
                    重新整理
                  </button>
                )}
                {evidence.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">还没有现场记录。</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {evidence.map((item) => (
                      <li key={item.id} className="flex gap-3 border-l-2 border-border pl-3">
                        <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                          {new Date(item.capturedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="min-w-0 flex-1">
                          {item.image && <img src={item.image} alt="现场照片" className="mb-1 max-h-36 rounded-lg object-contain" />}
                          {item.text && <p className="text-sm text-foreground/80">{item.text}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>

          <div className="mx-4 mb-3 flex items-end gap-1 rounded-3xl border border-border bg-card px-1 py-1 shadow-sm focus-within:border-primary">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="拍照"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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

            <textarea
              ref={noteInputRef}
              rows={1}
              className="my-1 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="例如：报警代码 E-12，已更换电导率传感器"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={() => { composing.current = false; }}
              onKeyDown={(event) => {
                // Enter records; Shift+Enter is how a multi-line remark is written.
                if (event.key === 'Enter' && !event.shiftKey && !composing.current) {
                  event.preventDefault();
                  addNote();
                }
              }}
            />

            <button
              type="button"
              onClick={composerAction === 'send' ? addNote : dictation.toggle}
              disabled={composerAction === 'busy' || composerAction === 'disabled'}
              aria-label={composerAction === 'send' ? '记录' : composerAction === 'stop-voice' ? '停止录音' : '语音记录'}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                composerAction === 'send'
                  ? 'bg-primary text-primary-foreground'
                  : composerAction === 'stop-voice'
                    ? 'bg-rose-500/15 text-rose-600 animate-pulse'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {composerAction === 'busy' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : composerAction === 'send' ? (
                <ArrowUp className="h-5 w-5" />
              ) : composerAction === 'stop-voice' ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          </div>
          {dictation.error && <p className="-mt-2 mb-2 px-5 text-xs text-rose-600">{dictation.error}</p>}
        </div>
      </footer>
      <PauseWorkOrderDialog workOrderId={id} open={pauseOpen} onClose={() => setPauseOpen(false)} onPaused={() => navigate('/')} />
    </div>
  );
}
