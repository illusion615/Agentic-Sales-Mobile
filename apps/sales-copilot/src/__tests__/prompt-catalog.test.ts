import { describe, expect, it } from 'vitest';
import { salesPrompts, renderPrompt, type SalesPromptKey } from '@/prompts';
import { availableFunctions } from '@/lib/function-registry';

/** Placeholder values are irrelevant here; only substitution completeness is. */
function renderWithStubs(key: SalesPromptKey): string {
  const prompt = salesPrompts.get(key);
  const stubs = Object.fromEntries(prompt.variables.map((name) => [name, `<${name}>`]));
  return renderPrompt(key, stubs);
}

describe('sales prompt catalog', () => {
  const prompts = salesPrompts.list();

  it('holds every prompt the app can send', () => {
    expect(prompts.length).toBeGreaterThanOrEqual(45);
  });

  it.each(prompts.map((p) => p.key))('%s renders with no unresolved placeholder', (key) => {
    const rendered = renderWithStubs(key as SalesPromptKey);
    expect(rendered).not.toMatch(/\{\{/);
    expect(rendered.trim().length).toBeGreaterThan(0);
  });

  it.each(prompts.map((p) => p.key))('%s declares a response format', (key) => {
    expect(salesPrompts.get(key as SalesPromptKey).responseFormat).toBeTruthy();
  });

  it('throws loudly rather than sending a prompt with a hole in it', () => {
    expect(() => renderPrompt('conversation.errorAnalysisRequest')).toThrow(/errorMessage/);
  });
});

describe('skill wiring', () => {
  const llmSkills = availableFunctions.filter((fn) => fn.llmBacked);

  it('every LLM-backed skill points at a catalogued prompt', () => {
    expect(llmSkills.length).toBe(10);
    for (const skill of llmSkills) {
      expect(skill.promptKey, `${skill.name} has no promptKey`).toBeTruthy();
      expect(salesPrompts.has(skill.promptKey!), `${skill.promptKey} is not in the catalog`).toBe(true);
    }
  });

  it('a skill prompt declares the same response format as its skill', () => {
    for (const skill of llmSkills) {
      expect(salesPrompts.get(skill.promptKey as SalesPromptKey).responseFormat).toBe(
        skill.responseFormat,
      );
    }
  });
});

describe('pipeline prompt structure', () => {
  it('frame keeps page and conversation context as the final two slots', () => {
    const body = salesPrompts.get('frame.classify').body;
    expect(body.endsWith('{{pageContext}}{{conversationContext}}')).toBe(true);
    expect(body).toContain('Now classify the latest user message.');
  });

  it('orchestrator anchors every relative date to the supplied today', () => {
    const rendered = renderPrompt('orchestrator.plan', {
      todayIso: '2026-08-03',
      weekday: 'Monday',
      skeleton: '  - seq=1',
      skills: '[queryAccounts]',
      boundEntities: '',
    });
    expect(rendered).toContain('Today is 2026-08-03 (Monday)');
    // The date is referenced in several rules; all of them must resolve.
    expect(rendered.match(/2026-08-03/g)?.length).toBeGreaterThanOrEqual(5);
    expect(rendered).toContain('# Skeleton');
    expect(rendered).toContain('# Available skills');
  });
});
