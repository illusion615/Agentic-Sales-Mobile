import { describe, expect, it } from 'vitest';
import type { QueueIntent } from '@/lib/intent-queue';
import { buildQueueSummaryMarkdown } from '@/lib/queue-summary';

function intent(
  id: string,
  status: QueueIntent['status'],
  args: Record<string, unknown>,
  fn = 'draftActivity',
): QueueIntent {
  return {
    id,
    index: Number(id.replace(/\D/g, '')) || 0,
    function: fn,
    arguments: args,
    resolutions: [],
    status,
  };
}

const labelFor = (item: QueueIntent, isZh: boolean) => {
  if (item.function === 'draftContact') return isZh ? '新建联系人' : 'Create contact';
  return isZh ? '记录活动' : 'Log activity';
};

describe('queue summary Markdown', () => {
  it('formats completed records as separate standard Markdown bullets without emoji', () => {
    const summary = buildQueueSummaryMarkdown({
      intents: [
        intent('1', 'confirmed', {
          title: 'Royal London Hospital - 拜访客户了解新部门采购设备需求',
          accountName: 'Royal London Hospital',
          scheduledDate: '2026-07-15',
        }),
        intent('2', 'confirmed', {
          title: 'Royal London Hospital - 本周内部会议讨论跟进策略',
          accountName: 'Royal London Hospital',
          scheduledDate: '2026-07-15',
        }),
      ],
      resolvedContext: {},
      locale: 'en-US',
      labelForIntent: labelFor,
    });

    expect(summary).toBe(
      'All 2 items done.\n\n' +
      '**Recorded**\n\n' +
      '- Royal London Hospital - 拜访客户了解新部门采购设备需求 (2026-07-15)\n' +
      '- Royal London Hospital - 本周内部会议讨论跟进策略 (2026-07-15)',
    );
    expect(summary).not.toMatch(/[✅⚠️❌•]/u);
  });

  it('formats Chinese completed records with one bullet per line', () => {
    const summary = buildQueueSummaryMarkdown({
      intents: [
        intent('1', 'confirmed', { fullName: 'Ethan Ge', title: 'China CIO', accountName: '金唯智' }, 'draftContact'),
        intent('2', 'confirmed', { fullName: 'Sun Jing', title: 'IT PM', accountName: '金唯智' }, 'draftContact'),
      ],
      resolvedContext: {},
      locale: 'zh-Hans',
      labelForIntent: labelFor,
    });

    expect(summary).toBe(
      '全部 2 项已完成。\n\n' +
      '**已记录**\n\n' +
      '- Ethan Ge (金唯智)\n' +
      '- Sun Jing (金唯智)',
    );
  });

  it('uses the contact name rather than the job title in skipped summaries', () => {
    const summary = buildQueueSummaryMarkdown({
      intents: [
        intent('1', 'cancelled', { fullName: 'Ethan Ge', title: 'China CIO' }, 'draftContact'),
      ],
      resolvedContext: {},
      locale: 'en-US',
      labelForIntent: labelFor,
    });

    expect(summary).toContain('**Skipped**\n\n- Ethan Ge');
    expect(summary).not.toContain('- China CIO');
  });

  it('formats skipped and failed sections without emoji and with Markdown lists', () => {
    const summary = buildQueueSummaryMarkdown({
      intents: [
        intent('1', 'confirmed', { title: 'Completed visit' }),
        intent('2', 'cancelled', { title: 'Skipped visit' }),
        intent('3', 'failed', { title: 'Failed visit' }),
      ],
      resolvedContext: {},
      locale: 'en-US',
      labelForIntent: labelFor,
    });

    expect(summary).toContain('1 completed, 1 skipped, 1 failed.');
    expect(summary).toContain('**Skipped**\n\n- Skipped visit');
    expect(summary).toContain('**Failed**\n\n- Log activity');
    expect(summary).not.toMatch(/[✅⚠️❌•]/u);
  });
});
