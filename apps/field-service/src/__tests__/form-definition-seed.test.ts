import { describe, expect, it } from 'vitest';
import { seedDefinitions } from '@/data/local/form-schema-repository';
import { seedWorkOrders } from '@/data/local/seed';
import { parseDesignerFormSchema } from '@/data/form-schema/designer-schema';
import { isFallback, selectFormDefinition } from '@/domain/form-definition';

/**
 * The seed catalogue is data, so its defects are data defects: a typo in an
 * incident type silently sends every job to the fallback form and nothing
 * fails. These tests hold the catalogue against the jobs it has to serve.
 */
describe('seeded form definitions', () => {
  it('parses every stored definition without warnings', () => {
    for (const definition of seedDefinitions()) {
      const { schema, warnings } = parseDesignerFormSchema(definition.definition, {
        id: definition.id,
        title: definition.title,
      });
      expect(warnings, `${definition.id} 解析告警`).toEqual([]);
      expect(schema.sections.length).toBeGreaterThan(0);
    }
  });

  it('offers exactly one fallback, so selection is never ambiguous', () => {
    expect(seedDefinitions().filter(isFallback)).toHaveLength(1);
  });

  it('serves the type-specific form to the job type it names', () => {
    const definitions = seedDefinitions();
    const specific = definitions.filter((d) => !isFallback(d));

    for (const definition of specific) {
      for (const incidentType of definition.appliesTo.incidentTypes) {
        expect(selectFormDefinition(definitions, { incidentType })?.id).toBe(definition.id);
      }
    }
  });

  it('names incident types that real jobs actually carry', () => {
    const jobTypes = new Set(seedWorkOrders().map((w) => w.incidentType));
    const claimed = seedDefinitions().flatMap((d) => d.appliesTo.incidentTypes);

    expect(claimed.length).toBeGreaterThan(0);
    for (const type of claimed) {
      expect(jobTypes, `没有工单的类型是「${type}」，定义永远选不中`).toContain(type);
    }
  });

  it('resolves a definition for every seeded job', () => {
    const definitions = seedDefinitions();
    for (const workOrder of seedWorkOrders()) {
      expect(selectFormDefinition(definitions, workOrder), workOrder.number).toBeDefined();
    }
  });
});
