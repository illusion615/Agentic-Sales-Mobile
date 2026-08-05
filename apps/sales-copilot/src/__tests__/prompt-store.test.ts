import { describe, expect, it } from 'vitest';
import { toPromptOverrides, type PromptRow } from '@/services/prompt-store';
import { salesPrompts } from '@/prompts';

const row = (over: Partial<PromptRow> = {}): PromptRow => ({
  crf5c_name: 'conversation.chatReply',
  crf5c_body: 'Be nice.',
  crf5c_contractversion: 1,
  crf5c_responseformat: 'text',
  crf5c_modeltier: 'standard',
  crf5c_promptversion: 3,
  ...over,
});

describe('toPromptOverrides', () => {
  it('maps a well-formed row', () => {
    expect(toPromptOverrides([row()])).toEqual([
      {
        key: 'conversation.chatReply',
        body: 'Be nice.',
        contractVersion: 1,
        responseFormat: 'text',
        modelTier: 'standard',
        version: 3,
      },
    ]);
  });

  it('drops rows with no key or no body', () => {
    expect(toPromptOverrides([row({ crf5c_name: undefined }), row({ crf5c_body: '' })])).toEqual([]);
  });

  it('ignores a response format the app does not know', () => {
    expect(toPromptOverrides([row({ crf5c_responseformat: 'yaml' })])[0].responseFormat).toBeUndefined();
  });

  it('treats a missing contract version as 0 so the registry refuses the row', () => {
    const [override] = toPromptOverrides([row({ crf5c_contractversion: undefined })]);
    expect(override.contractVersion).toBe(0);
    const report = salesPrompts.applyOverrides([override]);
    expect(report.applied).toEqual([]);
    expect(salesPrompts.get('conversation.chatReply').source).toBe('builtin');
  });
});
