/**
 * The pre-visit briefing, written by the model.
 *
 * Failure throws. There is no composed stand-in: this app reaches its model
 * through Dataverse, so a model that cannot be reached means a backend that
 * cannot be reached, and pretending otherwise would only hide that from the
 * technician.
 */
import type { BriefingProvider } from '@/domain/ports';
import type { Briefing, BriefingContext } from '@/domain/briefing';
import { buildBriefingPrompt, parseBriefingResponse } from '@/domain/briefing-contract';
import { invokeAi } from './prompt-gateway';

export function createAiBriefingProvider(): BriefingProvider {
  return {
    async generate(context: BriefingContext): Promise<Briefing> {
      const response = await invokeAi(
        { messages: [{ role: 'user', content: buildBriefingPrompt(context) }], responseFormat: 'json' },
        {
          label: 'briefing',
          operation: {
            operationType: 'field.previsit_briefing',
            queryText: `生成 ${context.workOrder.number} 行前简报`,
          },
        },
      );

      if (!response.success || !response.content) {
        throw new Error(response.error ?? 'AI 未返回内容');
      }

      const { briefing, problem } = parseBriefingResponse(response.content);
      if (!briefing) throw new Error(problem ?? 'AI 返回的简报无法使用');
      return briefing;
    },
  };
}
