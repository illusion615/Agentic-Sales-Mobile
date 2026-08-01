/**
 * The visit summary, written by the model. Fails loudly for the same reason the
 * briefing does.
 */
import type { VisitSummaryProvider } from '@/domain/ports';
import type { VisitSummary, VisitSummaryInput } from '@/domain/visit-summary';
import { buildVisitSummaryPrompt, parseVisitSummaryResponse } from '@/domain/visit-summary-contract';
import { invokeAi } from './prompt-gateway';

export function createAiVisitSummaryProvider(): VisitSummaryProvider {
  return {
    async summarise(input: VisitSummaryInput): Promise<VisitSummary> {
      const response = await invokeAi(
        { messages: [{ role: 'user', content: buildVisitSummaryPrompt(input) }], responseFormat: 'json' },
        {
          label: 'visit-summary',
          operation: {
            operationType: 'field.visit_summary',
            queryText: `生成 ${input.workOrder.number} 服务摘要`,
          },
        },
      );

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'AI 未返回内容');
      }

      const { summary, problem } = parseVisitSummaryResponse(response.content);
      if (!summary) throw new Error(problem ?? 'AI 返回的摘要无法使用');
      return summary;
    },
  };
}
