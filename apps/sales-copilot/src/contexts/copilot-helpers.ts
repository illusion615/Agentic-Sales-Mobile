/**
 * Task narration helpers — extracted from copilot-context.tsx.
 * Pure functions for building task overview/announce/collapse messages.
 */

import type { AgentResponse } from '@/lib/copilot-agent';
import type { PriorTaskOutcome } from '@/lib/task-narrator';
import { t, type Locale } from '@/lib/i18n';

// Re-use ChatMessage type from context (can't extract ChatMessage without circular dep,
// so we import it at the type level only)
type ChatMessage = import('./copilot-context').ChatMessage;
type IntentsOverview = NonNullable<AgentResponse['intentsOverview']>;

export function pickLabel(label: { zh: string; en: string } | undefined | null, isZh: boolean): string {
  // Null-safe: a missing bilingual label must degrade to '' rather than throw.
  if (!label) return '';
  return isZh ? label.zh : label.en;
}
const ZH_ORDINALS = ['第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九'];
export function ordinalZh(n: number): string {
  return ZH_ORDINALS[n - 1] ?? `第${n}`;
}

export function buildOverviewMessage(overview: IntentsOverview, locale: Locale): ChatMessage {
  const isZh = locale === 'zh-Hans';
  const labels = overview.map((o) => pickLabel(o.userFacingLabel, isZh));
  const joined = labels.join(t('listSeparator', locale));
  const text = t('identifiedIntents', locale, { n: overview.length, list: joined });
  return {
    id: `msg-${Date.now()}-overview`,
    role: 'assistant',
    type: 'agent',
    content: text,
    timestamp: new Date().toISOString(),
    taskRole: 'overview',
    taskOverview: { intents: overview.map((o) => ({ index: o.intentIndex, label: pickLabel(o.userFacingLabel, locale === 'zh-Hans') })) },
  };
}

export function buildAnnounceMessage(
  intentIndex: number,
  overview: IntentsOverview,
  locale: Locale,
): ChatMessage | null {
  const isZh = locale === 'zh-Hans';
  const entry = overview.find((o) => o.intentIndex === intentIndex);
  if (!entry) return null;
  const label = pickLabel(entry.userFacingLabel, isZh);
  const position = overview.findIndex((o) => o.intentIndex === intentIndex) + 1;
  const total = overview.length;
  const text = total > 1
    ? t('startingTaskNum', locale, { position, total, label })
    : t('startingLabel', locale, { label });
  const taskGroupId = `task-${intentIndex}`;
  return {
    id: `msg-${Date.now()}-announce-${intentIndex}`,
    role: 'assistant',
    type: 'agent',
    content: text,
    timestamp: new Date().toISOString(),
    taskGroupId,
    taskRole: 'announce',
    taskAnnounce: { index: position, total, label },
  };
}

export function hasMessageAfterLastUser(prev: ChatMessage[], predicate: (m: ChatMessage) => boolean): boolean {
  let lastUserIdx = -1;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'user') { lastUserIdx = i; break; }
  }
  for (let i = lastUserIdx + 1; i < prev.length; i++) {
    if (predicate(prev[i])) return true;
  }
  return false;
}

export function collapseEarlierTasks(prev: ChatMessage[], newIntentIndex: number): ChatMessage[] {
  let mutated = false;
  const next = prev.map((m) => {
    if (!m.taskGroupId) return m;
    const match = /^task-(\d+)$/.exec(m.taskGroupId);
    if (!match) return m;
    const idx = Number.parseInt(match[1], 10);
    if (!Number.isFinite(idx) || idx >= newIntentIndex) return m;
    if (m.collapsed) return m;
    mutated = true;
    return { ...m, collapsed: true };
  });
  return mutated ? next : prev;
}

export function extractPriorOutcomes(messages: ChatMessage[], upToIntentIndex: number): PriorTaskOutcome[] {
  const byGroup = new Map<string, { intentIdx: number; label: string; outcomeParts: string[] }>();
  for (const m of messages) {
    if (!m.taskGroupId) continue;
    const match = /^task-(\d+)$/.exec(m.taskGroupId);
    if (!match) continue;
    const intentIdx = Number.parseInt(match[1], 10);
    if (!Number.isFinite(intentIdx) || intentIdx >= upToIntentIndex) continue;
    let bucket = byGroup.get(m.taskGroupId);
    if (!bucket) {
      bucket = { intentIdx, label: '', outcomeParts: [] };
      byGroup.set(m.taskGroupId, bucket);
    }
    if (m.taskRole === 'announce' && m.taskAnnounce?.label) {
      bucket.label = m.taskAnnounce.label;
    } else if (m.taskRole === 'substep' && typeof m.content === 'string' && m.content.trim()) {
      bucket.outcomeParts.push(m.content.trim());
    }
  }
  return [...byGroup.values()]
    .sort((a, b) => a.intentIdx - b.intentIdx)
    .map((b) => ({
      taskGroupId: `task-${b.intentIdx}`,
      label: b.label || `task-${b.intentIdx}`,
      outcome: b.outcomeParts.length ? b.outcomeParts[b.outcomeParts.length - 1] : '(completed)',
    }));
}

// Conversation persistence constants
export const PERSIST_KEY = 'copilot-messages';
export const PERSIST_SCHEMA_VERSION = 3;
export const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export interface PersistEnvelope {
  v: number;
  savedAt: number;
  messages: ChatMessage[];
}
