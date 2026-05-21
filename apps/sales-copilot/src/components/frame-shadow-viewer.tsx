/**
 * Frame Shadow Viewer (方案 3 · Phase 1)
 * --------------------------------------------------------------------------
 * Renders the in-memory ring buffer of Frame shadow runs so the boss can
 * compare the sales-coach Frame output against the legacy intent prompt on
 * real user messages. Nothing in this component affects production behaviour.
 *
 * Triggered by a small "F" pill that floats in the copilot panel header.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCcw, Trash2, Activity as ActivityIcon } from 'lucide-react';
import {
  readShadowLog,
  clearShadowLog,
  type ShadowLogEntry,
} from '@/lib/frame-shadow';
import {
  readBenchmarkLog,
  type ShadowBenchmarkEntry,
} from '@/lib/shadow-agent';
import { isDagPlan } from '@/lib/dag-schema';
import type { Locale } from '@/lib/i18n';

interface FrameShadowViewerProps {
  open: boolean;
  onClose: () => void;
  locale: Locale;
}

export function FrameShadowViewer({ open, onClose, locale }: FrameShadowViewerProps) {
  const [entries, setEntries] = useState<ShadowLogEntry[]>([]);
  const [benchmarks, setBenchmarks] = useState<ShadowBenchmarkEntry[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEntries(readShadowLog());
    setBenchmarks(readBenchmarkLog());
  }, [open, tick]);

  const stats = useMemo(() => {
    if (entries.length === 0) {
      return {
        total: 0, frameOk: 0,
        // Speed
        legacyAvgMs: 0, shadowAvgMs: 0, speedDelta: 0,
        // Accuracy
        funcMatch: 0, funcComparable: 0,
        avgArgOverlap: 0,
      };
    }
    let frameOk = 0;
    for (const e of entries) {
      if (e.frame.success) frameOk += 1;
    }
    // Orchestrator benchmark stats
    let funcMatch = 0;
    let funcComparable = 0;
    let argOverlapSum = 0;
    let argOverlapN = 0;
    let legacyLatencySum = 0;
    let legacyLatencyN = 0;
    let shadowLatencySum = 0;
    let shadowLatencyN = 0;
    for (const b of benchmarks) {
      if (b.agreement.functionMatch !== null && b.agreement.functionMatch !== undefined) {
        funcComparable += 1;
        if (b.agreement.functionMatch) funcMatch += 1;
      }
      if (b.agreement.argumentOverlap !== null && b.agreement.argumentOverlap !== undefined) {
        argOverlapSum += b.agreement.argumentOverlap;
        argOverlapN += 1;
      }
      if (b.legacy?.latencyMs) {
        legacyLatencySum += b.legacy.latencyMs;
        legacyLatencyN += 1;
      }
      if (b.shadow.totalLatencyMs) {
        shadowLatencySum += b.shadow.totalLatencyMs;
        shadowLatencyN += 1;
      }
    }
    const legacyAvgMs = legacyLatencyN ? Math.round(legacyLatencySum / legacyLatencyN) : 0;
    const shadowAvgMs = shadowLatencyN ? Math.round(shadowLatencySum / shadowLatencyN) : 0;
    const speedDelta = legacyAvgMs && shadowAvgMs ? Math.round(((legacyAvgMs - shadowAvgMs) / legacyAvgMs) * 100) : 0;
    return {
      total: entries.length,
      frameOk,
      legacyAvgMs,
      shadowAvgMs,
      speedDelta,
      funcMatch: funcComparable ? Math.round((funcMatch / funcComparable) * 100) : 0,
      funcComparable,
      avgArgOverlap: argOverlapN ? Math.round((argOverlapSum / argOverlapN) * 100) : 0,
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
                    {locale === 'zh-Hans' ? 'Frame 影子模式 · 销售专家思考记录' : 'Frame Shadow Mode · Sales-Coach Reasoning Log'}
                  </div>
                  <div className="text-xs text-stone-500">
                    {locale === 'zh-Hans'
                      ? `近 ${stats.total} 轮 · Legacy ${stats.legacyAvgMs}ms vs Shadow ${stats.shadowAvgMs}ms`
                      : `Last ${stats.total} runs · Legacy ${stats.legacyAvgMs}ms vs Shadow ${stats.shadowAvgMs}ms`}
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
                    clearShadowLog();
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

            {/* KPI Dashboard: Speed + Accuracy */}
            <div className="border-b border-stone-200 bg-stone-50/60 px-4 py-3 text-xs">
              {/* Speed comparison */}
              <div className="mb-2 text-[10px] uppercase tracking-wide text-stone-400">
                {locale === 'zh-Hans' ? '⚡ 速度（平均延迟）' : '⚡ Speed (avg latency)'}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Tile
                  label="Legacy"
                  value={stats.legacyAvgMs ? `${stats.legacyAvgMs}ms` : '—'}
                />
                <Tile
                  label="Shadow"
                  value={stats.shadowAvgMs ? `${stats.shadowAvgMs}ms` : '—'}
                />
                <Tile
                  label={locale === 'zh-Hans' ? '差值' : 'Delta'}
                  value={stats.speedDelta ? `${stats.speedDelta > 0 ? '+' : ''}${stats.speedDelta}%` : '—'}
                  hint={stats.speedDelta > 0 ? (locale === 'zh-Hans' ? 'Shadow 更快' : 'Shadow faster') : stats.speedDelta < 0 ? (locale === 'zh-Hans' ? 'Legacy 更快' : 'Legacy faster') : undefined}
                />
              </div>
              {/* Accuracy comparison */}
              <div className="mb-2 text-[10px] uppercase tracking-wide text-stone-400">
                {locale === 'zh-Hans' ? '🎯 精度（Shadow vs Legacy 一致性）' : '🎯 Accuracy (Shadow vs Legacy agreement)'}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Tile
                  label={locale === 'zh-Hans' ? '函数匹配' : 'Function Match'}
                  value={`${stats.funcMatch}%`}
                  hint={`${stats.funcComparable} ${locale === 'zh-Hans' ? '条可比' : 'comparable'}`}
                />
                <Tile
                  label={locale === 'zh-Hans' ? '参数重叠' : 'Arg Overlap'}
                  value={`${stats.avgArgOverlap}%`}
                />
                <Tile
                  label={locale === 'zh-Hans' ? '样本量' : 'Samples'}
                  value={`${stats.total}`}
                  hint={`${stats.frameOk} ${locale === 'zh-Hans' ? '成功' : 'ok'}`}
                />
              </div>
            </div>

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

function EntryRow({ entry, benchmark, locale }: { entry: ShadowLogEntry; benchmark?: ShadowBenchmarkEntry; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  const f = entry.frame.result;
  const ok = entry.frame.success;
  const time = new Date(entry.ts).toLocaleTimeString();
  const funcBadge = benchmark ? badge(benchmark.agreement.functionMatch, locale) : null;

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
              <Chip muted>L: {benchmark.legacy?.latencyMs ?? '?'}ms</Chip>
              <Chip muted>S: {benchmark.shadow.totalLatencyMs}ms</Chip>
              {benchmark.legacy?.latencyMs && benchmark.shadow.totalLatencyMs ? (
                <Chip>{benchmark.shadow.totalLatencyMs < benchmark.legacy.latencyMs ? '🟢' : '🔴'} {Math.abs(benchmark.shadow.totalLatencyMs - benchmark.legacy.latencyMs)}ms</Chip>
              ) : null}
            </>
          )}
          <span className="text-stone-400">|</span>
          {/* Function routing */}
          <Chip outlined>L: {entry.legacy?.functionName ?? 'null'}</Chip>
          <span className="text-stone-400">→</span>
          {benchmark?.shadow.plan ? (
            <Chip>{isDagPlan(benchmark.shadow.plan) ? `DAG ×${benchmark.shadow.plan.steps.length}` : (benchmark.shadow.plan as { function: string }).function}</Chip>
          ) : (
            <Chip danger>—</Chip>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50/60 px-3 py-2 text-xs">
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
                  <span className="text-stone-500">{locale === 'zh-Hans' ? '点名实体：' : 'Explicit entities:'}</span>
                  {f.explicitNames.map((n, i) => (
                    <span key={i} className="ml-1 rounded bg-stone-200 px-1.5 py-0.5">
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
          {entry.legacy?.raw && (
            <details className="mt-2">
              <summary className="cursor-pointer text-stone-500">Legacy raw JSON</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-stone-900/90 p-2 text-[10px] text-stone-100">
                {entry.legacy.raw}
              </pre>
            </details>
          )}
          {benchmark && (
            <div className="mt-2 border-t border-stone-200 pt-2">
              <div className="mb-1 flex items-center gap-2 text-stone-500">
                <span>{locale === 'zh-Hans' ? '🤖 Orchestrator 输出：' : '🤖 Orchestrator output:'}</span>
                {benchmark.shadow.plan ? (
                  <Chip>{isDagPlan(benchmark.shadow.plan) ? `DAG ${benchmark.shadow.plan.steps.length} steps` : benchmark.shadow.plan.function ?? 'null'}</Chip>
                ) : (
                  <Chip danger>{benchmark.shadow.error?.slice(0, 60) ?? 'Failed'}</Chip>
                )}
                <Chip muted>{benchmark.shadow.skillsCount} skills</Chip>
                <Chip muted>{benchmark.shadow.planLatencyMs}ms</Chip>
              </div>
              {benchmark.shadow.planRaw && (
                <details>
                  <summary className="cursor-pointer text-stone-500">{locale === 'zh-Hans' ? 'Orchestrator raw' : 'Orchestrator raw'}</summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-indigo-900/90 p-2 text-[10px] text-indigo-100">
                    {benchmark.shadow.planRaw}
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
