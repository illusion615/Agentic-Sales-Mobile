import type { BriefingProvider } from '@/domain/ports';
import { recentFirst, recurringIncidents, type Briefing, type BriefingContext } from '@/domain/briefing';

/**
 * Composes the briefing from the record, deterministically.
 *
 * This is a stand-in for the language model that will write it in production,
 * and it reports `source: 'rules'` so the UI can say so. It is useful beyond
 * development: it is the floor the AI version must beat, and it keeps working
 * when the model is unavailable.
 */
export function createRuleBasedBriefingProvider(): BriefingProvider {
  return {
    async generate(context: BriefingContext): Promise<Briefing> {
      const { workOrder, customer, history } = context;
      const ordered = recentFirst(history);
      const repeats = recurringIncidents(ordered, workOrder.incidentType);
      const last = ordered[0];

      const background: string[] = [];
      background.push(
        `${customer.name}报修「${workOrder.incidentType ?? '未分类'}」${
          workOrder.assetName ? `，涉及${workOrder.assetName}` : ''
        }。`,
      );
      if (workOrder.summary) background.push(workOrder.summary);
      if (repeats.length >= 2) {
        background.push(`该故障在过去已重复出现 ${repeats.length} 次，需按反复故障处理。`);
      } else if (last) {
        background.push(`上次到访处理的是「${last.incidentType}」。`);
      } else {
        background.push('该客户暂无历史服务记录。');
      }

      const watchOuts: string[] = [];
      if (customer.siteAccessNotes) watchOuts.push(customer.siteAccessNotes);
      watchOuts.push(...(customer.cautions ?? []));
      if (workOrder.instructions) watchOuts.push(workOrder.instructions);
      if (repeats.length >= 2) {
        watchOuts.push('前两次均为临时性处理，本次需排查根因，避免再次返修。');
      }

      const preparation: string[] = [];
      if (last?.resolution) preparation.push(`参考上次处理：${last.resolution}`);
      if (workOrder.assetName) preparation.push(`确认${workOrder.assetName}的备件与耗材是否在车`);
      if (customer.contacts.length > 0) {
        const primary = customer.contacts[0];
        preparation.push(
          `抵达前联系${primary.name}${primary.role ? `（${primary.role}）` : ''}${
            primary.phone ? ` ${primary.phone}` : ''
          }`,
        );
      }

      return {
        background: background.join(''),
        watchOuts,
        preparation,
        source: 'rules',
      };
    },
  };
}
