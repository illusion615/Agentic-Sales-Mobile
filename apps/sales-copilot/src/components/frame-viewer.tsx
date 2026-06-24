/**
 * Pipeline Inspector (dev tool)
 * --------------------------------------------------------------------------
 * Renders the in-memory ring buffer of intent pipeline runs so developers can
 * inspect Frame→Orchestrator pipeline execution on
 * real user messages. Nothing in this component affects production behaviour.
 *
 * Triggered by a small "F" pill that floats in the copilot panel header.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCcw, Trash2, Activity as ActivityIcon, Copy, Check } from 'lucide-react';
import {
  readPipelineLog,
  clearPipelineLog,
  type PipelineLogEntry,
} from '@/lib/frame';
import {
  readBenchmarkLog,
  type BenchmarkEntry,
} from '@/lib/orchestrator';
import {
  readConversationStateLog,
  clearConversationStateLog,
  type ConversationStateSnapshot,
} from '@/lib/conversation-state';
import { isDagPlan } from '@/lib/dag-schema';
import type { Locale } from '@/lib/i18n';

interface PipelineViewerProps {
  open: boolean;
  onClose: () => void;
  locale: Locale;
}

export function PipelineViewer({ open, onClose, locale }: PipelineViewerProps) {
  const [entries, setEntries] = useState<PipelineLogEntry[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);
  const [convStates, setConvStates] = useState<ConversationStateSnapshot[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEntries(readPipelineLog());
    setBenchmarks(readBenchmarkLog());
    setConvStates(readConversationStateLog());
  }, [open, tick]);

  const stats = useMemo(() => {
    if (entries.length === 0) {
      return {
        total: 0, frameOk: 0, pipelineAvgMs: 0,
      };
    }
    let frameOk = 0;
    for (const e of entries) {
      if (e.frame.success) frameOk += 1;
    }
    // Orchestrator benchmark stats
    let pipelineLatencySum = 0;
    let pipelineLatencyN = 0;
    for (const b of benchmarks) {
      if (b.result.totalLatencyMs) {
        pipelineLatencySum += b.result.totalLatencyMs;
        pipelineLatencyN += 1;
      }
    }
    const pipelineAvgMs = pipelineLatencyN ? Math.round(pipelineLatencySum / pipelineLatencyN) : 0;
    return {
      total: entries.length,
      frameOk,
      pipelineAvgMs,
    };
  }, [entries, benchmarks]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <ActivityIcon className="h-5 w-5 text-orange-600" />
                <div>
                  <div className="text-sm font-semibold text-stone-900">
                    {locale === 'zh-Hans' ? 'Frame 意图分析 · 销售专家思考记录' : 'Frame Inspector · Sales-Coach Reasoning Log'}
                  </div>
                  <div className="text-xs text-stone-500">
                    {locale === 'zh-Hans'
                      ? `近 ${stats.total} 轮 · Pipeline avg ${stats.pipelineAvgMs}ms`
                      : `Last ${stats.total} runs · Pipeline avg ${stats.pipelineAvgMs}ms`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200"
                  title={locale === 'zh-Hans' ? '刷新' : 'Refresh'}
                  onClick={() => setTick((n) => n + 1)}
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
                <button
                  className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200"
                  title={locale === 'zh-Hans' ? '清空' : 'Clear'}
                  onClick={() => {
                    clearPipelineLog();
                    clearConversationStateLog();
                    setTick((n) => n + 1);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200"
                  title={locale === 'zh-Hans' ? '关闭' : 'Close'}
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* KPI Dashboard */}
            <div className="border-b border-stone-200 bg-stone-50/60 px-4 py-3 text-xs">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-stone-400">
                {locale === 'zh-Hans' ? '⚡ 流水线性能' : '⚡ Pipeline Performance'}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Tile
                  label={locale === 'zh-Hans' ? '平均延迟' : 'Avg Latency'}
                  value={stats.pipelineAvgMs ? `${stats.pipelineAvgMs}ms` : '—'}
                />
                <Tile
                  label={locale === 'zh-Hans' ? '成功率' : 'Success Rate'}
                  value={stats.total ? `${Math.round((stats.frameOk / stats.total) * 100)}%` : '—'}
                  hint={`${stats.frameOk}/${stats.total}`}
                />
                <Tile
                  label={locale === 'zh-Hans' ? '样本量' : 'Samples'}
                  value={`${stats.total}`}
                />
              </div>
            </div>

            {/* Conversation State panel (C1) */}
            <ConversationStatePanel snapshot={convStates[0]} locale={locale} />

            {/* Entry list */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {entries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-stone-400">
                  {locale === 'zh-Hans' ? '暂无记录 · 发出任意消息后会出现' : 'No records yet · Send any message to generate logs'}
                </div>
              ) : (
                <ul className="space-y-3">
                  {entries.map((e, idx) => {
                    // Find matching benchmark entry by timestamp proximity
                    const bench = benchmarks.find(b => Math.abs(b.ts - e.ts) < 5000 && b.userMessage === e.userMessage);
                    return (
                      <EntryRow key={`${e.ts}-${idx}`} entry={e} benchmark={bench} locale={locale} />
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-stone-400">{label}</div>
      <div className="text-base font-semibold text-stone-900">{value}</div>
      {hint && <div className="text-[10px] text-stone-400">{hint}</div>}
    </div>
  );
}

/**
 * C1: Conversation State panel — shows the latest committed state snapshot
 * (focus / working sets / pending goal) plus this turn's [ConvState] decision
 * lines. Collapsible; dev-only observability, no effect on behaviour.
 */
function ConversationStatePanel({ snapshot, locale }: { snapshot?: ConversationStateSnapshot; locale: Locale }) {
  const [open, setOpen] = useState(true);
  const zh = locale === 'zh-Hans';
  return (
    <div className="border-b border-stone-200 bg-indigo-50/40 px-4 py-3 text-xs">
      <button
        className="mb-2 flex w-full items-center justify-between text-[10px] uppercase tracking-wide text-indigo-500"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{zh ? '🧠 会话状态（最近一轮）' : '🧠 Conversation State (latest turn)'}</span>
        <span className="text-stone-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        !snapshot ? (
          <div className="text-stone-400">{zh ? '暂无状态 · 发出查询/指代消息后出现' : 'No state yet · send a query or referring message'}</div>
        ) : (
          <div className="space-y-2">
            {/* Focus */}
            <div>
              <div className="text-[10px] font-semibold text-indigo-600">{zh ? 'Focus（实体焦点）' : 'Focus'}</div>
              {snapshot.focus.length === 0 ? (
                <div className="text-stone-400">—</div>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {snapshot.focus.slice(0, 5).map((f, i) => (
                    <li key={i} className="font-mono text-[11px] text-stone-700">
                      <span className="text-indigo-700">{f.type}</span> "{f.name}"
                      {f.id ? <span className="text-stone-400"> ({f.id.slice(0, 8)}…)</span> : null}
                      <span className="text-stone-400"> · conf {f.confidence} · {f.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Working sets */}
            <div>
              <div className="text-[10px] font-semibold text-indigo-600">{zh ? 'Working sets（结果集缓存）' : 'Working sets'}</div>
              {snapshot.workingSets.length === 0 ? (
                <div className="text-stone-400">—</div>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {snapshot.workingSets.map((w, i) => (
                    <li key={i} className="font-mono text-[11px] text-stone-700">
                      {w.sourceFunction} · {w.count} {zh ? '条' : 'recs'}
                      <span className={w.stale ? 'text-rose-500' : 'text-emerald-600'}> · {w.stale ? 'stale' : 'fresh'}</span>
                      {w.filterSummary ? <span className="text-stone-400"> · {w.filterSummary}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Pending goal */}
            {snapshot.pendingGoal && (
              <div>
                <div className="text-[10px] font-semibold text-indigo-600">{zh ? 'Pending goal（未完成任务）' : 'Pending goal'}</div>
                <div className="font-mono text-[11px] text-stone-700">
                  {snapshot.pendingGoal.fn} · {snapshot.pendingGoal.state}
                  {snapshot.pendingGoal.missing.length ? <span className="text-rose-500"> · missing: {snapshot.pendingGoal.missing.join(', ')}</span> : null}
                </div>
              </div>
            )}
            {/* Decisions */}
            {snapshot.decisions.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-indigo-600">{zh ? '本轮决策' : 'This turn'}</div>
                <ul className="mt-0.5 space-y-0.5">
                  {snapshot.decisions.map((d, i) => (
                    <li key={i} className="font-mono text-[10px] text-stone-600">{d.replace('[ConvState] ', '')}</li>
                  ))}
                </ul>
              </div>
            )}
            {snapshot.rollingSummary && (
              <div>
                <div className="text-[10px] font-semibold text-indigo-600">{zh ? '滚动摘要' : 'Rolling summary'}</div>
                <div className="text-[11px] text-stone-600">{snapshot.rollingSummary}</div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

function EntryRow({ entry, benchmark, locale }: { entry: PipelineLogEntry; benchmark?: BenchmarkEntry; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  const f = entry.frame.result;
  const ok = entry.frame.success;
  const time = new Date(entry.ts).toLocaleTimeString();
  const funcBadge = null; // legacy comparison removed

  return (
    <li className="rounded-lg border border-stone-200 bg-white">
      <button
        type="button"
        className="flex w-full flex-col gap-1 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>
            {time}
            {entry.page ? ` · ${entry.page}` : ''}
          </span>
          <span className="flex items-center gap-1">
            {funcBadge}
          </span>
        </div>
        <div className="line-clamp-2 text-sm text-stone-900">{entry.userMessage}</div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
          {/* Speed per request */}
          {benchmark && (
            <>
              <Chip muted>Pipeline: {benchmark.result.totalLatencyMs}ms</Chip>
            </>
          )}
          <span className="text-stone-400">|</span>
          {/* Function routing */}
          
          
          {benchmark?.result.plan ? (
            <Chip>{benchmark.result.plan && isDagPlan(benchmark.result.plan) ? `DAG ×${benchmark.result.plan.steps.length}` : (benchmark.result.plan as { function: string }).function}</Chip>
          ) : (
            <Chip danger>—</Chip>
          )}
          {/* Degradation visibility: surface any LLM retry that fired this turn. */}
          {benchmark?.result.frameRetried && (
            <Chip danger>⟳ Frame retry</Chip>
          )}
          {benchmark?.result.planRetried && (
            <Chip danger>⟳ Plan retry</Chip>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50/60 px-3 py-2 text-xs">
          {/* Degradation detail: explain why a retry fired, so it's traceable. */}
          {(benchmark?.result.frameRetried || benchmark?.result.planRetried) && (
            <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
              <div className="font-medium">{locale === 'zh-Hans' ? '⚠️ 本轮触发了重试（降级）' : '⚠️ Retry fired this turn (degradation)'}</div>
              {benchmark?.result.frameRetried && (
                <div>Frame: {benchmark.result.frameRetryReason ?? 'first attempt malformed'}</div>
              )}
              {benchmark?.result.planRetried && (
                <div>Orchestrator: {benchmark.result.planRetryReason ?? 'first attempt malformed'}</div>
              )}
            </div>
          )}
          {/* Copy the exact prompts sent to the LLM, for offline testing. */}
          {(benchmark?.result.framePrompt || benchmark?.result.planPrompt) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-stone-400">
                {locale === 'zh-Hans' ? '复制 Prompt' : 'Copy Prompt'}
              </span>
              {benchmark?.result.framePrompt && (
                <CopyPromptButton
                  label={locale === 'zh-Hans' ? 'Frame' : 'Frame'}
                  text={benchmark.result.framePrompt}
                  locale={locale}
                />
              )}
              {benchmark?.result.planPrompt && (
                <CopyPromptButton
                  label={locale === 'zh-Hans' ? 'Orchestrator' : 'Orchestrator'}
                  text={benchmark.result.planPrompt}
                  locale={locale}
                />
              )}
            </div>
          )}
          {ok && f ? (
            <>
              <div className="mb-1 text-stone-500">
                {locale === 'zh-Hans' ? `识别到 ${f.intents.length} 个意图：` : `${f.intents.length} intent(s) detected:`}
              </div>
              <ol className="mb-2 list-decimal space-y-1 pl-4 text-stone-700">
                {f.intents.map((it, i) => (
                  <li key={i}>
                    <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
                      {it.salesObject}_{it.cognitiveTask}
                    </span>
                    <span className="ml-1 text-[10px] text-stone-500">[{it.temporal}]</span>
                    {it.relatesTo.length > 0 && (
                      <span className="ml-1 text-[10px] text-indigo-600">
                        →{it.relatesTo.map((r) => `#${r}`).join(',')}
                      </span>
                    )}
                    <div className="text-[11px] text-stone-700">{it.summary}</div>
                  </li>
                ))}
              </ol>
              <div className="mb-1 text-stone-500">{locale === 'zh-Hans' ? '销售教练推理：' : 'Sales-coach reasoning:'}</div>
              <div className="mb-2 italic text-stone-700">{f.reasoning}</div>
              {f.explicitNames && f.explicitNames.length > 0 && (
                <div className="mb-2">
                  <span className="text-stone-600 font-medium">{locale === 'zh-Hans' ? '点名实体：' : 'Explicit entities:'}</span>
                  {f.explicitNames.map((n, i) => (
                    <span key={i} className="ml-1 rounded bg-stone-700 px-1.5 py-0.5 text-stone-50">
                      {n.kind}:{n.text}
                    </span>
                  ))}
                </div>
              )}
              {f.boundEntities && (
                <div className="mb-2 text-stone-600">
                  {locale === 'zh-Hans' ? '页面绑定：' : 'Page bindings:'}
                  {f.boundEntities.account && <span className="ml-1">A:{f.boundEntities.account.name}</span>}
                  {f.boundEntities.opportunity && <span className="ml-1">O:{f.boundEntities.opportunity.name}</span>}
                  {f.boundEntities.contact && <span className="ml-1">C:{f.boundEntities.contact.name}</span>}
                </div>
              )}
            </>
          ) : (
            <div className="text-rose-600">{entry.frame.error}</div>
          )}
          
          {benchmark && (
            <div className="mt-2 border-t border-stone-200 pt-2">
              <div className="mb-1 flex items-center gap-2 text-stone-500">
                <span>{locale === 'zh-Hans' ? '🤖 Orchestrator 输出：' : '🤖 Orchestrator output:'}</span>
                {benchmark.result.plan ? (
                  <Chip>{benchmark.result.plan && isDagPlan(benchmark.result.plan) ? `DAG ${benchmark.result.plan.steps.length} steps` : benchmark.result.plan.function ?? 'null'}</Chip>
                ) : (
                  <Chip danger>{benchmark.result.error?.message?.slice(0, 60) ?? 'Failed'}</Chip>
                )}
                <Chip muted>{benchmark.result.skillsCount} skills</Chip>
                <Chip muted>{benchmark.result.planLatencyMs}ms</Chip>
              </div>
              {benchmark.result.planRaw && (
                <details>
                  <summary className="cursor-pointer text-stone-500">{locale === 'zh-Hans' ? 'Orchestrator raw' : 'Orchestrator raw'}</summary>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-indigo-900/90 p-2 text-[10px] text-indigo-100">
                    {benchmark.result.planRaw}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function CopyPromptButton({ label, text, locale }: { label: string; text: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API may be blocked in the embedded iframe — fall back to a temp textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
        copied
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
      }`}
      title={`${locale === 'zh-Hans' ? '复制' : 'Copy'} ${label} prompt (${text.length})`}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? (locale === 'zh-Hans' ? '已复制' : 'Copied') : label}
    </button>
  );
}

function Chip({
  children,
  muted,
  outlined,
  danger,
}: {
  children: React.ReactNode;
  muted?: boolean;
  outlined?: boolean;
  danger?: boolean;
}) {
  const cls = danger
    ? 'bg-rose-100 text-rose-700'
    : outlined
      ? 'border border-stone-300 text-stone-700'
      : muted
        ? 'bg-stone-100 text-stone-600'
        : 'bg-orange-100 text-orange-700';
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

function badge(v: boolean | null | undefined, locale: Locale) {
  if (v === true) {
    return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">{locale === 'zh-Hans' ? '一致' : 'Match'}</span>;
  }
  if (v === false) {
    return <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700">{locale === 'zh-Hans' ? '不一致' : 'Mismatch'}</span>;
  }
  return <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">N/A</span>;
}
