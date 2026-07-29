/**
 * Prefill expressions.
 *
 * Form definitions carry expressions such as `#workorder?.customer?.name` or
 * `new java.util.Date()`. They arrive from a database, so they are UNTRUSTED
 * INPUT: evaluating them with `eval`, `new Function` or any interpreter that
 * can reach the runtime would turn a row in a table into remote code execution
 * in every technician's session.
 *
 * So nothing is executed. Only two forms are recognised — a property path read
 * out of a supplied context, and a small table of named values — and anything
 * else is reported as unsupported rather than guessed at. Reporting matters:
 * an unsupported expression is a gap to close deliberately, not something to
 * discover later as a silently blank field.
 */
import type { FieldValue, FormSchema, FormValue } from './form-schema';
import { allFields } from './form-schema';

export interface PrefillResult {
  value?: FormValue;
  /** Set when the expression was not recognised; carries it back verbatim. */
  unsupported?: string;
}

/** Named expressions, including the Java forms legacy definitions still use. */
const NAMED: Record<string, () => FormValue> = {
  'new java.util.Date()': () => todayIso(),
  'now()': () => todayIso(),
  'today()': () => todayIso(),
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A path is only ever letters, digits, underscores and separators. */
const PATH_PATTERN = /^#?[A-Za-z_$][\w$]*((\?\.|\.)[A-Za-z_$][\w$]*)*$/;

function readPath(path: string, context: Record<string, unknown>): FormValue | undefined {
  const segments = path.replace(/^#/, '').split(/\?\.|\./);
  let current: unknown = context;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    // Own properties only: prototype keys are not data.
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null || current === undefined) return undefined;
  if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
    return current;
  }
  if (Array.isArray(current) && current.every((item) => typeof item === 'string')) {
    return current as string[];
  }
  // Objects are not renderable in a form field; treat as no value.
  return undefined;
}

export function evaluatePrefill(
  expression: string | undefined,
  context: Record<string, unknown>,
): PrefillResult {
  const trimmed = (expression ?? '').trim();
  if (!trimmed) return {};

  const named = NAMED[trimmed];
  if (named) return { value: named() };

  if (PATH_PATTERN.test(trimmed)) {
    const value = readPath(trimmed, context);
    // A path that resolves to nothing is a legitimate blank, not a failure.
    return value === undefined ? {} : { value };
  }

  return { unsupported: trimmed };
}

export interface PrefillOutcome {
  values: FieldValue[];
  /** Expressions the evaluator does not implement, for diagnostics. */
  unsupported: Array<{ field: string; expression: string }>;
}

/** Seed a blank form from its prefill expressions. */
export function applyPrefills(schema: FormSchema, context: Record<string, unknown>): PrefillOutcome {
  const values: FieldValue[] = [];
  const unsupported: PrefillOutcome['unsupported'] = [];

  for (const field of allFields(schema)) {
    const result = evaluatePrefill(field.prefill, context);
    if (result.unsupported) {
      unsupported.push({ field: field.name, expression: result.unsupported });
      continue;
    }
    if (result.value !== undefined) {
      values.push({ name: field.name, value: result.value, source: 'prefill' });
    }
  }

  return { values, unsupported };
}
