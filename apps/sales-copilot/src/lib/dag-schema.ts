/**
 * DAG Execution Schema
 *
 * When the sub-prompt detects multiple intents (e.g. "create an opportunity +
 * schedule two meetings"), it outputs a `steps[]` array where each step has a
 * sequence number and optional dependency references.
 *
 * Steps with the same `seq` can execute in parallel.
 * Steps with higher `seq` wait for all lower `seq` steps to complete.
 * `$ref` placeholders (e.g. "$opp.id") are resolved from prior step outputs.
 */

import { z } from 'zod';

/** A single step in the DAG execution plan. */
export const DagStepSchema = z.object({
  /** Execution order. Steps with the same seq run in parallel. */
  seq: z.number().int().min(1),
  /** Reference name for this step's output (e.g. "$opp"). */
  outputRef: z.string().optional(),
  /** References this step depends on (e.g. ["$opp"]). */
  dependsOn: z.array(z.string()).optional(),
  /** The function to call. */
  function: z.string(),
  /** Arguments for the function. May contain $ref.field placeholders. */
  arguments: z.record(z.unknown()),
  /** When true, skip Dataverse query and use page context data instead. */
  usePageContext: z.boolean().optional(),
});

export type DagStep = z.infer<typeof DagStepSchema>;

/** The full execution plan returned by a sub-prompt. */
export const DagPlanSchema = z.object({
  steps: z.array(DagStepSchema).min(1),
});

export type DagPlan = z.infer<typeof DagPlanSchema>;

/** Single-intent output (most sub-prompts return this). */
export const SingleIntentSchema = z.object({
  function: z.string(),
  arguments: z.record(z.unknown()),
});

export type SingleIntent = z.infer<typeof SingleIntentSchema>;

/**
 * Sub-prompt output: either a single intent or a multi-step DAG plan.
 * Sub-prompts that handle single-object cells return SingleIntent.
 * Sub-prompts for Mixed or multi-intent cells return DagPlan.
 */
export type SubPromptOutput = SingleIntent | DagPlan;

export function isDagPlan(output: SubPromptOutput): output is DagPlan {
  return 'steps' in output && Array.isArray((output as DagPlan).steps);
}

/**
 * Resolve $ref.field placeholders in step arguments using prior step outputs.
 */
export function resolveRefs(
  args: Record<string, unknown>,
  context: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      // e.g. "$opp.id" → context["$opp"]["id"]
      const [refName, field] = value.split('.');
      if (refName && field && context[refName]) {
        resolved[key] = context[refName][field];
      } else {
        resolved[key] = value; // unresolved — keep as-is
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
