import type { VisitSummaryProvider } from '@/domain/ports';
import type { VisitSummary, VisitSummaryInput } from '@/domain/visit-summary';
import { allFields, isAnswered, valueOf, type FormField, type FormValue } from '@/domain/form-schema';

/**
 * Composes the review summary from the answers, deterministically.
 *
 * A stand-in for the model that will write it, and the floor that model has to
 * beat. It reports `source: 'rules'`, which the UI shows, so a composed summary
 * is never passed off as a written one.
 */

function optionLabels(field: FormField, value: FormValue): string[] {
  const keys = Array.isArray(value) ? value : [value];
  return keys
    .filter((key): key is string => typeof key === 'string')
    .map((key) => field.options?.find((o) => o.key === key)?.label ?? key);
}

export function createRuleBasedVisitSummaryProvider(): VisitSummaryProvider {
  return {
    async summarise(input: VisitSummaryInput): Promise<VisitSummary> {
      const { workOrder, schema, values } = input;
      const highlights: string[] = [];
      const narrative: string[] = [];

      for (const field of allFields(schema)) {
        const entry = valueOf(values, field.name);
        if (!entry || !isAnswered(entry.value)) continue;

        if (field.type === 'multi-select' || field.type === 'single-select') {
          const labels = optionLabels(field, entry.value);
          if (labels.length > 0) highlights.push(`${cleanLabel(field.label)}：${labels.join('、')}`);
          continue;
        }

        // Long-form answers carry the story; short identity fields do not.
        if (field.type === 'textarea' && typeof entry.value === 'string' && entry.value.trim().length > 6) {
          narrative.push(entry.value.trim());
        }
      }

      const opening = `本次于${workOrder.customerName}完成${workOrder.incidentType ?? '现场服务'}。`;
      const body = narrative.length > 0 ? narrative.slice(0, 2).join(' ') : '现场记录尚未形成完整结论。';

      return {
        text: `${opening}${body}`,
        highlights: highlights.slice(0, 4),
        source: 'rules',
      };
    },
  };
}

/** Strip the authoring ornaments so a label reads as a phrase. */
function cleanLabel(label: string): string {
  return label.replace(/^\s*\d+\s*[、.．)）]\s*/, '').replace(/[：:？?\s]+$/, '');
}
