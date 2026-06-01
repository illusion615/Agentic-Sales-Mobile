/**
 * Frame contextSufficient + schema tests.
 * Validates the Frame output schema including the new contextSufficient field.
 */
import { describe, it, expect } from 'vitest';
import { FrameResultSchema, tryParseFrame } from '@/lib/frame-shadow';

describe('FrameResultSchema', () => {
  it('parses valid frame output', () => {
    const input = {
      intents: [{ salesObject: 'Opportunity', cognitiveTask: 'Analyze', temporal: 'none', summary: 'analyze pipeline', relatesTo: [] }],
      explicitNames: [],
      reasoning: 'follow-up about existing data',
      confidence: 85,
    };
    const result = FrameResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intents).toHaveLength(1);
      expect(result.data.confidence).toBe(85);
    }
  });

  it('defaults reasoning to empty string when missing', () => {
    const input = {
      intents: [{ salesObject: 'Account', cognitiveTask: 'Find', temporal: 'none', summary: 'find accounts', relatesTo: [] }],
      explicitNames: [],
      confidence: 90,
    };
    const result = FrameResultSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reasoning).toBe('');
    }
  });

  it('rejects empty intents array', () => {
    const input = {
      intents: [],
      explicitNames: [],
      reasoning: '',
      confidence: 50,
    };
    const result = FrameResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('tryParseFrame', () => {
  it('parses valid JSON frame output', () => {
    const json = JSON.stringify({
      intents: [{ salesObject: 'Activity', cognitiveTask: 'Log', temporal: 'past', summary: 'visited client', relatesTo: [] }],
      explicitNames: [{ kind: 'account', text: 'Royal London' }],
      contextSufficient: false,
      reasoning: 'single past visit',
      confidence: 92,
    });
    const result = tryParseFrame(json);
    expect(result).not.toBeNull();
    expect(result!.intents).toHaveLength(1);
    expect(result!.intents[0].salesObject).toBe('Activity');
  });

  it('coerces relatesTo from object wrappers', () => {
    const json = JSON.stringify({
      intents: [
        { salesObject: 'Activity', cognitiveTask: 'Log', temporal: 'past', summary: 'visit', relatesTo: [] },
        { salesObject: 'Opportunity', cognitiveTask: 'Log', temporal: 'past', summary: 'opp', relatesTo: [{ item: 0 }] },
      ],
      explicitNames: [],
      reasoning: '',
      confidence: 80,
    });
    const result = tryParseFrame(json);
    expect(result).not.toBeNull();
    expect(result!.intents[1].relatesTo).toEqual([0]);
  });

  it('returns null for unparseable input', () => {
    expect(tryParseFrame('not json')).toBeNull();
    expect(tryParseFrame('')).toBeNull();
  });
});
