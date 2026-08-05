/**
 * Placeholder substitution for prompt bodies.
 *
 * `{{name}}` was chosen because prompt bodies are full of single braces (JSON
 * output examples), so a single-brace syntax would collide with the content
 * they are trying to describe.
 */
import type { PromptVariables } from './types';

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export class PromptRenderError extends Error {
  constructor(message: string, readonly key?: string) {
    super(message);
    this.name = 'PromptRenderError';
  }
}

/** Placeholder names used by a body, in first-appearance order, deduped. */
export function extractPlaceholders(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Substitutes every placeholder. A missing variable throws rather than
 * rendering an empty hole: a silently truncated instruction is far more
 * damaging than a loud failure, and every render path is covered by tests.
 * An empty string is a legitimate value (optional blocks pass `''`).
 */
export function renderPromptTemplate(
  body: string,
  variables: PromptVariables = {},
  key?: string,
): string {
  return body.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null) {
      throw new PromptRenderError(
        `Prompt${key ? ` "${key}"` : ''} is missing variable "${name}"`,
        key,
      );
    }
    return String(value);
  });
}
