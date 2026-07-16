import type { IntentQueue, QueueIntent } from '@/lib/intent-queue';
import { formCardPrimaryText } from '@/lib/form-card-display';

export type QueueSummaryLocale = 'zh-Hans' | 'en-US';

export interface QueueSummaryInput {
  intents: readonly QueueIntent[];
  resolvedContext: IntentQueue['resolvedContext'];
  locale: QueueSummaryLocale;
  labelForIntent: (intent: QueueIntent, isZh: boolean) => string;
}

/**
 * Build the deterministic create/draft queue summary as standard Markdown.
 *
 * The renderer is intentionally generic. This producer owns blank-line
 * separation and `- ` list markers so CommonMark preserves one record per row.
 */
export function buildQueueSummaryMarkdown({
  intents,
  resolvedContext,
  locale,
  labelForIntent,
}: QueueSummaryInput): string {
  const isZh = locale === 'zh-Hans';
  const done = intents.filter((intent) => intent.status === 'confirmed');
  const skipped = intents.filter((intent) => intent.status === 'cancelled' || intent.status === 'skipped');
  const failed = intents.filter((intent) => intent.status === 'failed');
  const sections: string[] = [];

  if (done.length === intents.length) {
    sections.push(isZh ? `全部 ${intents.length} 项已完成。` : `All ${intents.length} items done.`);
  } else {
    const counts: string[] = [];
    if (done.length) counts.push(isZh ? `${done.length} 项已完成` : `${done.length} completed`);
    if (skipped.length) counts.push(isZh ? `${skipped.length} 项跳过` : `${skipped.length} skipped`);
    if (failed.length) counts.push(isZh ? `${failed.length} 项失败` : `${failed.length} failed`);
    if (counts.length) sections.push(counts.join(isZh ? '，' : ', ') + (isZh ? '。' : '.'));
  }

  const recorded = done
    .map((intent) => recordedDetail(intent, resolvedContext))
    .filter((detail): detail is string => !!detail)
    .map((detail) => `- ${detail}`);
  if (recorded.length) {
    sections.push(`${isZh ? '**已记录**' : '**Recorded**'}\n\n${recorded.join('\n')}`);
  }

  if (skipped.length) {
    const items = skipped.map((intent) => {
      const args = intent.arguments;
      return intent.function === 'draftContact'
        ? formCardPrimaryText('contact', args) || labelForIntent(intent, isZh)
        : (args.title ?? args.name ?? labelForIntent(intent, isZh)) as string;
    });
    sections.push(isZh
      ? `**未创建**\n\n- ${items.join('\n- ')}\n\n如需跟进，请手动操作。`
      : `**Skipped**\n\n- ${items.join('\n- ')}\n\nCreate manually if needed.`);
  }

  if (failed.length) {
    sections.push(isZh
      ? `**执行失败**\n\n${failed.map((intent) => `- ${labelForIntent(intent, true)}`).join('\n')}\n\n请稍后重试。`
      : `**Failed**\n\n${failed.map((intent) => `- ${labelForIntent(intent, false)}`).join('\n')}\n\nRetry later.`);
  }

  return sections.join('\n\n');
}

function recordedDetail(
  intent: QueueIntent,
  resolvedContext: IntentQueue['resolvedContext'],
): string | null {
  const args = intent.arguments;
  const title = intent.function === 'draftContact'
    ? formCardPrimaryText('contact', args) || intent.result?.recordName || ''
    : (args.title ?? args.name ?? args.fullName ?? intent.result?.recordName ?? '') as string;
  if (!title) return null;

  const account = (args.accountName ?? resolvedContext.accountName ?? '') as string;
  const date = (args.scheduledStart ?? args.scheduledDate ?? '') as string;
  const contact = (args.contactName ?? '') as string;
  const extras: string[] = [];
  if (date) extras.push(date);
  if (account && !title.toLowerCase().includes(account.toLowerCase())) extras.push(account);
  if (contact && !title.toLowerCase().includes(contact.toLowerCase())) extras.push(contact);
  return extras.length ? `${title} (${extras.join(' · ')})` : title;
}
