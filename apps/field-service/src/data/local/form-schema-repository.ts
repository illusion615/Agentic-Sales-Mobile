import type { FormSchemaRepository } from '@/domain/ports';
import type { FormSchema } from '@/domain/form-schema';
import type { WorkOrderDetail } from '@/domain/work-order';
import { parseDesignerFormSchema } from '../form-schema/designer-schema';
import visitForm from '../form-schema/visit-form.json';

/**
 * Serves form definitions from bundled fixtures.
 *
 * The definition is still parsed rather than written as a typed literal, so
 * this exercises the same path a Dataverse-served definition will take —
 * including the warnings a malformed or unrecognised entry produces.
 */
const DEFINITIONS: Record<string, { id: string; title: string; raw: unknown }> = {
  default: { id: 'visit-form', title: '客户走访服务单', raw: visitForm },
};

export function createLocalFormSchemaRepository(): FormSchemaRepository {
  const cache = new Map<string, FormSchema>();

  return {
    async getSchemaForWorkOrder(workOrder: WorkOrderDetail): Promise<FormSchema> {
      // Selection is by job type today; a real source keys it by customer,
      // business line and version as well.
      const key = workOrder.incidentType && DEFINITIONS[workOrder.incidentType] ? workOrder.incidentType : 'default';
      const cached = cache.get(key);
      if (cached) return cached;

      const definition = DEFINITIONS[key];
      const { schema, warnings } = parseDesignerFormSchema(definition.raw, {
        id: definition.id,
        title: definition.title,
      });
      if (warnings.length > 0) console.warn('[FormSchema] 定义解析告警：', warnings);

      cache.set(key, schema);
      return schema;
    },
  };
}
