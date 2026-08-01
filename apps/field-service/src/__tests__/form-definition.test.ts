import { describe, expect, it } from 'vitest';
import {
  formDefinitionKey,
  isFallback,
  selectFormDefinition,
  type FormDefinition,
} from '@/domain/form-definition';

function definition(overrides: Partial<FormDefinition> & { formId: string; version: number }): FormDefinition {
  return {
    id: formDefinitionKey(overrides.formId, overrides.version),
    title: overrides.formId,
    status: 'published',
    appliesTo: { incidentTypes: [] },
    definition: [],
    ...overrides,
  };
}

const FALLBACK_V1 = definition({ formId: 'visit', version: 1 });
const FALLBACK_V2 = definition({ formId: 'visit', version: 2 });
const DIALYSIS = definition({
  formId: 'dialysis',
  version: 1,
  appliesTo: { incidentTypes: ['透析机停机'] },
});

describe('formDefinitionKey', () => {
  it('gives each version its own identity', () => {
    expect(formDefinitionKey('visit', 1)).toBe('visit@1');
    expect(formDefinitionKey('visit', 2)).not.toBe(formDefinitionKey('visit', 1));
  });
});

describe('isFallback', () => {
  it('treats a form naming no job type as the catch-all', () => {
    expect(isFallback(FALLBACK_V1)).toBe(true);
    expect(isFallback(DIALYSIS)).toBe(false);
  });
});

describe('selectFormDefinition', () => {
  it('prefers the form written for the job type over the catch-all', () => {
    const chosen = selectFormDefinition([FALLBACK_V2, DIALYSIS], { incidentType: '透析机停机' });
    expect(chosen?.formId).toBe('dialysis');
  });

  it('falls back when no form names the job type', () => {
    const chosen = selectFormDefinition([FALLBACK_V2, DIALYSIS], { incidentType: '耗材补充' });
    expect(chosen?.id).toBe('visit@2');
  });

  it('falls back for a job with no type at all', () => {
    expect(selectFormDefinition([FALLBACK_V1, DIALYSIS], {})?.formId).toBe('visit');
  });

  /** Publishing a new version must not disturb what is already captured. */
  it('serves the highest published version', () => {
    expect(selectFormDefinition([FALLBACK_V1, FALLBACK_V2], {})?.version).toBe(2);
    expect(selectFormDefinition([FALLBACK_V2, FALLBACK_V1], {})?.version).toBe(2);
  });

  it('never serves a draft or a retired form', () => {
    const draft = definition({ formId: 'visit', version: 3, status: 'draft' });
    const retired = definition({ formId: 'visit', version: 4, status: 'retired' });
    expect(selectFormDefinition([FALLBACK_V2, draft, retired], {})?.version).toBe(2);
  });

  it('ignores a job-type form that is not published', () => {
    const unpublished = definition({
      formId: 'dialysis',
      version: 2,
      status: 'draft',
      appliesTo: { incidentTypes: ['透析机停机'] },
    });
    const chosen = selectFormDefinition([FALLBACK_V2, unpublished], { incidentType: '透析机停机' });
    expect(chosen?.formId).toBe('visit');
  });

  it('has nothing to serve when no form is published', () => {
    const draft = definition({ formId: 'visit', version: 1, status: 'draft' });
    expect(selectFormDefinition([draft], {})).toBeUndefined();
  });
});
