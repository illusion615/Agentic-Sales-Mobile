/**
 * Copilot helpers tests — task narration pure functions.
 */
import { describe, it, expect } from 'vitest';
import {
  pickLabel, ordinalZh, buildOverviewMessage, buildAnnounceMessage,
  hasMessageAfterLastUser, collapseEarlierTasks,
  PERSIST_KEY, PERSIST_SCHEMA_VERSION, PERSIST_TTL_MS,
} from '@/contexts/copilot-helpers';

describe('pickLabel', () => {
  it('returns zh label when isZh=true', () => {
    expect(pickLabel({ zh: '查找客户', en: 'Find Account' }, true)).toBe('查找客户');
  });
  it('returns en label when isZh=false', () => {
    expect(pickLabel({ zh: '查找客户', en: 'Find Account' }, false)).toBe('Find Account');
  });
});

describe('ordinalZh', () => {
  it('returns ordinal for 1-9', () => {
    expect(ordinalZh(1)).toBe('第一');
    expect(ordinalZh(3)).toBe('第三');
  });
  it('falls back for numbers > 9', () => {
    expect(ordinalZh(10)).toBe('第10');
  });
});

describe('buildOverviewMessage', () => {
  it('builds zh overview for multiple intents', () => {
    const msg = buildOverviewMessage([
      { intentIndex: 0, userFacingLabel: { zh: '登记拜访', en: 'Log visit' } },
      { intentIndex: 1, userFacingLabel: { zh: '创建商机', en: 'Create opp' } },
    ], 'zh-Hans');
    expect(msg.content).toContain('2 个意图');
    expect(msg.content).toContain('登记拜访');
    expect(msg.taskRole).toBe('overview');
  });
});

describe('buildAnnounceMessage', () => {
  const overview = [
    { intentIndex: 0, userFacingLabel: { zh: '登记拜访', en: 'Log visit' } },
    { intentIndex: 1, userFacingLabel: { zh: '创建商机', en: 'Create opp' } },
  ];

  it('builds announce for existing intent', () => {
    const msg = buildAnnounceMessage(0, overview, 'zh-Hans');
    expect(msg).not.toBeNull();
    expect(msg!.taskRole).toBe('announce');
    expect(msg!.taskAnnounce?.index).toBe(1);
    expect(msg!.taskAnnounce?.total).toBe(2);
  });

  it('returns null for non-existent intent', () => {
    expect(buildAnnounceMessage(99, overview, 'zh-Hans')).toBeNull();
  });
});

describe('hasMessageAfterLastUser', () => {
  const msgs = [
    { id: '1', role: 'user' as const, type: 'user' as const, content: 'hi', timestamp: '' },
    { id: '2', role: 'assistant' as const, type: 'agent' as const, content: 'hello', timestamp: '', taskRole: 'overview' as const },
  ];

  it('finds matching message after last user', () => {
    expect(hasMessageAfterLastUser(msgs, (m) => m.taskRole === 'overview')).toBe(true);
  });

  it('returns false when no match', () => {
    expect(hasMessageAfterLastUser(msgs, (m) => m.taskRole === 'announce')).toBe(false);
  });
});

describe('collapseEarlierTasks', () => {
  it('collapses tasks before newIntentIndex', () => {
    const msgs = [
      { id: '1', type: 'agent' as const, content: '', timestamp: '', taskGroupId: 'task-0' },
      { id: '2', type: 'agent' as const, content: '', timestamp: '', taskGroupId: 'task-1' },
    ];
    const result = collapseEarlierTasks(msgs, 1);
    expect(result[0].collapsed).toBe(true);
    expect(result[1].collapsed).toBeUndefined();
  });
});

describe('persistence constants', () => {
  it('exports expected values', () => {
    expect(PERSIST_KEY).toBe('copilot-messages');
    expect(PERSIST_SCHEMA_VERSION).toBe(3);
    expect(PERSIST_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
