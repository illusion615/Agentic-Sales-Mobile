/**
 * Reading the captured notes.
 *
 * The call goes through the shared invoker, so it carries a trace GUID and
 * lands in the same AI call ledger as every other AI call in the estate.
 *
 * Failure throws rather than returning nothing. A silent empty result is
 * indistinguishable from "the notes said nothing", and the difference matters:
 * one means keep talking, the other means the form will stay blank until
 * someone notices. The caller surfaces it and offers a retry; the form itself
 * stays editable throughout, so a technician is never blocked.
 */
import type { FieldExtractor } from '@/domain/ports';
import type { ExtractionInput, ExtractionResult } from '@/domain/extraction';
import { buildExtractionPrompt, parseExtractionResponse } from '@/domain/extraction-contract';
import { invokeAi } from './prompt-gateway';

export class AiExtractionFailedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AiExtractionFailedError';
  }
}

export function createAiFieldExtractor(): FieldExtractor {
  return {
    async extract(input: ExtractionInput): Promise<ExtractionResult> {
      const response = await invokeAi(
        { messages: [{ role: 'user', content: buildExtractionPrompt(input) }], responseFormat: 'json' },
        {
          label: 'field-extraction',
          operation: {
            operationType: 'field.form_extraction',
            queryText: `提取 ${input.workOrder.number} 现场记录`,
          },
        },
      );

      if (!response.success || !response.content) {
        throw new AiExtractionFailedError(response.error ?? 'AI 未返回内容');
      }

      const { fields, customerUpdates, warnings } = parseExtractionResponse(
        response.content,
        input.schema,
        input.evidence,
      );
      if (warnings.length > 0) console.warn('[AI 抽取] 已丢弃不合规的建议：', warnings);

      return { fields, customerUpdates };
    },
  };
}
