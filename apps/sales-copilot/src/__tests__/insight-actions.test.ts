import { describe, it, expect } from 'vitest';
import { normalizeInsightActions, parseInsightActions } from '@/lib/insight-actions';

describe('normalizeInsightActions', () => {
  it('keeps valid actions and coerces the type to the enum', () => {
    const out = normalizeInsightActions([
      { title: 'Call', type: 'CALL', explanation: 'because X', dueInDays: 2 },
      { title: 'Zoom', type: 'zoom', explanation: '', dueInDays: 5 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('call');
    expect(out[1].type).toBe('call'); // unknown type → call
  });

  it('drops entries without a title and caps at 3 (judicious)', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ title: `T${i}`, type: 'email', dueInDays: 1 }));
    expect(normalizeInsightActions([{ type: 'call' }, ...many])).toHaveLength(3);
  });

  it('clamps dueInDays into 1–30 with a default of 3', () => {
    expect(normalizeInsightActions([{ title: 'x', type: 'call', dueInDays: -5 }])[0].dueInDays).toBe(3);
    expect(normalizeInsightActions([{ title: 'y', type: 'call', dueInDays: 999 }])[0].dueInDays).toBe(30);
    expect(normalizeInsightActions([{ title: 'z', type: 'call' }])[0].dueInDays).toBe(3);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeInsightActions(null)).toEqual([]);
    expect(normalizeInsightActions('nope')).toEqual([]);
    expect(normalizeInsightActions({})).toEqual([]);
  });
});

describe('parseInsightActions', () => {
  it('parses a JSON array string into actions', () => {
    const json = JSON.stringify([{ title: 'A', type: 'meeting', explanation: 'e', dueInDays: 3 }]);
    const out = parseInsightActions(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'A', type: 'meeting', explanation: 'e' });
  });

  it('returns [] for legacy markdown, empty, or nullish', () => {
    expect(parseInsightActions('### Action Items\n- do x')).toEqual([]);
    expect(parseInsightActions('')).toEqual([]);
    expect(parseInsightActions(undefined)).toEqual([]);
    expect(parseInsightActions(null)).toEqual([]);
  });
});
