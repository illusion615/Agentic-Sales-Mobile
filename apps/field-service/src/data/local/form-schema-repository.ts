import type { FormSchemaRepository } from '@/domain/ports';
import type { FormSchema } from '@/domain/form-schema';
import {
  formDefinitionKey,
  selectFormDefinition,
  type FormDefinition,
} from '@/domain/form-definition';
import type { WorkOrderDetail } from '@/domain/work-order';
import { parseDesignerFormSchema } from '../form-schema/designer-schema';
import { createIdbCollection } from './idb';
import dialysisRepairForm from '../form-schema/dialysis-repair-form.json';
import visitForm from '../form-schema/visit-form.json';

const STORE = 'formdefinitions';

/**
 * Seed definitions.
 *
 * Held as authoring-tool output rather than typed literals so this exercises
 * the same parsing path a Dataverse-served definition will take, warnings
 * included. A published version is never edited in place; a change is a new
 * row carrying the next version.
 */
export function seedDefinitions(): FormDefinition[] {
  return [
    {
      id: formDefinitionKey('visit-form', 1),
      formId: 'visit-form',
      version: 1,
      title: '客户走访服务单',
      status: 'published',
      appliesTo: { incidentTypes: [] },
      definition: visitForm,
    },
    {
      id: formDefinitionKey('dialysis-repair-form', 1),
      formId: 'dialysis-repair-form',
      version: 1,
      title: '透析机维修单',
      status: 'published',
      appliesTo: { incidentTypes: ['透析机停机'] },
      definition: dialysisRepairForm,
    },
  ];
}

export function createLocalFormSchemaRepository(): FormSchemaRepository {
  const collection = createIdbCollection<FormDefinition>(STORE);
  const parsed = new Map<string, FormSchema>();
  let seeding: Promise<void> | null = null;

  function ready(): Promise<void> {
    if (!seeding) {
      seeding = collection.all().then(async (rows) => {
        const existing = new Set(rows.map((row) => row.id));
        const missing = seedDefinitions().filter((row) => !existing.has(row.id));
        if (missing.length > 0) await collection.putAll(missing);
      });
    }
    return seeding;
  }

  async function resolveForWorkOrder(workOrder: WorkOrderDetail) {
    await ready();
    const definition = selectFormDefinition(await collection.all(), workOrder);
    if (!definition) {
      throw new Error(`没有已发布的表单定义可用于 ${workOrder.number}`);
    }

    const cached = parsed.get(definition.id);
    if (cached) return { schema: cached, definition };

    const { schema, warnings } = parseDesignerFormSchema(definition.definition, {
      id: definition.id,
      title: definition.title,
    });
    if (warnings.length > 0) console.warn('[FormSchema] 定义解析告警：', warnings);

    parsed.set(definition.id, schema);
    return { schema, definition };
  }

  return {
    async listDefinitions(): Promise<FormDefinition[]> {
      await ready();
      return collection.all();
    },

    resolveForWorkOrder,

    async getSchemaForWorkOrder(workOrder: WorkOrderDetail): Promise<FormSchema> {
      return (await resolveForWorkOrder(workOrder)).schema;
    },
  };
}
