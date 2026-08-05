import { describe, expect, it } from 'vitest';
import {
  createPromptRegistry,
  extractPlaceholders,
  PromptRenderError,
  renderPromptTemplate,
  type PromptDefinition,
} from '../prompt';

const catalog: PromptDefinition[] = [
  {
    key: 'demo.greet',
    body: 'Hello {{name}}, today is {{today}}. Say hi to {{name}} again.',
    contractVersion: 1,
    responseFormat: 'text',
  },
  {
    key: 'demo.plain',
    body: 'Return JSON: { "ok": true }',
    contractVersion: 2,
    responseFormat: 'json-generic',
  },
];

describe('renderPromptTemplate', () => {
  it('substitutes every occurrence of a placeholder', () => {
    expect(renderPromptTemplate('{{a}}-{{b}}-{{a}}', { a: 'x', b: 'y' })).toBe('x-y-x');
  });

  it('accepts an empty string as a real value', () => {
    expect(renderPromptTemplate('start{{block}}end', { block: '' })).toBe('startend');
  });

  it('throws instead of leaving a hole when a variable is missing', () => {
    expect(() => renderPromptTemplate('{{a}}', {}, 'demo')).toThrow(PromptRenderError);
  });

  it('leaves single-brace JSON examples untouched', () => {
    const body = 'Return { "intents": [ { "salesObject": "Account" } ] } and nothing else.';
    expect(renderPromptTemplate(body, {})).toBe(body);
  });
});

describe('extractPlaceholders', () => {
  it('returns unique names in first-appearance order', () => {
    expect(extractPlaceholders('{{b}} {{a}} {{b}}')).toEqual(['b', 'a']);
  });
});

describe('createPromptRegistry', () => {
  it('rejects duplicate keys at construction', () => {
    expect(() => createPromptRegistry([catalog[0], catalog[0]], { appId: "demo-app" })).toThrow(/Duplicate prompt key/);
  });

  it('derives the variable contract from the builtin body', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    expect(registry.get('demo.greet').variables).toEqual(['name', 'today']);
    expect(registry.get('demo.plain').variables).toEqual([]);
  });

  it('renders through the registry', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    expect(registry.render('demo.greet', { name: 'Wells', today: '2026-08-03' })).toContain(
      'Hello Wells, today is 2026-08-03',
    );
  });

  it('throws on an unknown key', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    expect(() => registry.get('nope')).toThrow(/Unknown prompt key/);
  });

  it('applies an external body that keeps the contract', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    const report = registry.applyOverrides([
      { key: 'demo.greet', body: 'Hi {{name}}!', contractVersion: 1, version: 7 },
    ]);
    expect(report).toEqual({ applied: ['demo.greet'], rejected: [] });
    expect(registry.render('demo.greet', { name: 'Wells', today: 'x' })).toBe('Hi Wells!');
    const resolved = registry.get('demo.greet');
    expect(resolved.source).toBe('external');
    expect(resolved.version).toBe(7);
    // The contract still comes from the builtin body, not the override.
    expect(resolved.variables).toEqual(['name', 'today']);
  });

  it('refuses an external body whose contract version this build cannot parse', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    const report = registry.applyOverrides([
      { key: 'demo.greet', body: 'Hi {{name}}', contractVersion: 2 },
    ]);
    expect(report.applied).toEqual([]);
    expect(report.rejected[0].reason).toMatch(/contract version/);
    expect(registry.get('demo.greet').source).toBe('builtin');
  });

  it('refuses an external body that invents a variable the app never supplies', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    const report = registry.applyOverrides([
      { key: 'demo.greet', body: 'Hi {{name}} from {{secretSauce}}', contractVersion: 1 },
    ]);
    expect(report.rejected[0].reason).toMatch(/secretSauce/);
    expect(registry.get('demo.greet').source).toBe('builtin');
  });

  it('refuses an external body that changes the response format', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    const report = registry.applyOverrides([
      { key: 'demo.plain', body: 'anything', contractVersion: 2, responseFormat: 'text' },
    ]);
    expect(report.rejected[0].reason).toMatch(/response format/);
  });

  it('refuses unknown keys and empty bodies, and reports each one', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    const report = registry.applyOverrides([
      { key: 'ghost', body: 'x', contractVersion: 1 },
      { key: 'demo.plain', body: '   ', contractVersion: 2 },
    ]);
    expect(report.applied).toEqual([]);
    expect(report.rejected.map((r) => r.key)).toEqual(['ghost', 'demo.plain']);
  });

  it('falls back to the builtin body when overrides are cleared', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    registry.applyOverrides([{ key: 'demo.greet', body: 'Hi {{name}}', contractVersion: 1 }]);
    registry.clearOverrides();
    expect(registry.get('demo.greet').source).toBe('builtin');
    expect(registry.render('demo.greet', { name: 'a', today: 'b' })).toContain('Hello a');
  });

  it('refuses a row that belongs to a different app', () => {
    const registry = createPromptRegistry(catalog, { appId: 'demo-app' });
    const report = registry.applyOverrides([
      { key: 'demo.greet', body: 'Hi {{name}}', contractVersion: 1, app: 'other-app' },
    ]);
    expect(report.applied).toEqual([]);
    expect(report.rejected[0].reason).toMatch(/belongs to app "other-app"/);
    expect(registry.get('demo.greet').source).toBe('builtin');
  });

  it('accepts a row stamped with its own app', () => {
    const registry = createPromptRegistry(catalog, { appId: 'demo-app' });
    const report = registry.applyOverrides([
      { key: 'demo.greet', body: 'Hi {{name}}', contractVersion: 1, app: 'demo-app' },
    ]);
    expect(report.applied).toEqual(['demo.greet']);
  });

  it('lists every builtin key', () => {
    const registry = createPromptRegistry(catalog, { appId: "demo-app" });
    expect(registry.list().map((p) => p.key)).toEqual(['demo.greet', 'demo.plain']);
  });
});
