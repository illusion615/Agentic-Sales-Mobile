/**
 * Function Executor — thin dispatcher
 *
 * All named handlers (query, draft, update, resolve, misc) are registered
 * in lib/functions/ and dispatched via the handler registry. This file
 * only contains the dispatcher + the generic LLM-backed skill fallback.
 */

import { availableFunctions, coerceArgs } from './function-registry';
import { agentError, toDevLog } from '@/lib/errors';
import { getHandler, type FunctionCallResult } from './functions/handler-registry';
import type { Locale } from '@/lib/i18n';
import type { StandaloneAiOperation } from '@/services/power-automate-service';
// Register all domain handlers (query, draft, etc.)
import './functions';

export { type FunctionCallResult } from './functions/handler-registry';

/**
 * Execute a function by name with given arguments.
 * Named handlers are dispatched via the handler registry (lib/functions/).
 * Only the generic LLM-backed skill fallback remains in this file.
 */
export async function executeFunction(
  functionName: string,
  args: Record<string, unknown>,
  context: {
    userId?: string;
    userEmail?: string;
    pageContext?: {
      currentPage?: string;
      summary?: string;
      pageData?: unknown;
    };
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    locale?: string;
    /** Explicit metadata for data-driven AI work outside a chat turn. */
    standaloneAiOperation?: StandaloneAiOperation;
  }
): Promise<import('./functions/handler-registry').FunctionCallResult> {
  console.log('[FN] ENTER executeFunction, name=' + functionName + ', args=' + JSON.stringify(args));

  // Normalize LLM tool-call args against the function's declared input contract
  // (see coerceArgs in function-registry). This absorbs "argument type drift"
  // — e.g. an array sent where a scalar string is declared — at the single
  // dispatch boundary, so every handler receives correctly-typed values instead
  // of casting `unknown` and crashing on `x.toLowerCase()`. Coerce-not-block:
  // malformed args never abort the call.
  args = coerceArgs(functionName, args);

  // ---- Registry dispatch ----
  const registeredHandler = getHandler(functionName);
  if (registeredHandler) {
    return registeredHandler(args, context);
  }

  // ---- Fallback: generic LLM-backed skill handler ----
  try {
    const skillDef = availableFunctions.find((f) => f.name === functionName);
    if (skillDef?.llmBacked && skillDef.promptTemplate) {
      // Prompts are authored in ENGLISH only; the output-language directive pins the
      // reply to the user's selected locale (zh/en/de/fr/es).
      const { outputLanguageDirective } = await import('@/lib/i18n');
      const locale = (context.locale || 'en-US') as Locale;
      const systemPrompt = `${skillDef.promptTemplate}\n\n${outputLanguageDirective(locale)}`;
      const userContent = args.data as string || args.visitData as string || JSON.stringify(args);

          // Append extra context if provided (e.g. existingOpportunities for analyzeOpportunity)
          let fullUser = userContent;
          if (args.existingOpportunities) {
            fullUser += `\n\nExisting opportunities (for deduplication):\n${args.existingOpportunities as string}`;
          }
          if (args.entityType) {
            fullUser = `Entity type: ${args.entityType as string}\n\n${fullUser}`;
          }

          // The response format is part of the skill's declared contract — no silent default.
          const responseFormat = skillDef.responseFormat;
          if (!responseFormat) {
            return { success: false, error: `[fn:${functionName}] LLM skill missing responseFormat contract` };
          }

          const { invokeFlowForLLM } = await import('@/services/power-automate-service');
          const llmResp = await invokeFlowForLLM({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: fullUser },
            ],
            responseFormat,
          }, {
            label: `Skill: ${functionName}`,
            standaloneOperation: context.standaloneAiOperation,
          });

          if (!llmResp.success || !llmResp.content) {
            return { success: false, error: llmResp.error || 'LLM skill call failed' };
          }

          // Parse strictly per the declared responseFormat, then validate against the
          // declared outputSchema. Both are contract-driven — the executor never guesses
          // per-skill shapes, and callers receive a validated, typed payload.
          const validate = (value: unknown): FunctionCallResult => {
            if (!skillDef.outputSchema) return { success: true, data: value };
            const result = skillDef.outputSchema.safeParse(value);
            if (!result.success) {
              const err = agentError('parse', 'executor',
                `Skill "${functionName}" output failed its declared schema`,
                result.error,
                { functionName, responseFormat, issues: result.error.issues.slice(0, 5) },
              );
              console.warn('[FunctionExecutor]', toDevLog(err));
              return { success: false, error: toDevLog(err) };
            }
            return { success: true, data: result.data };
          };

          if (responseFormat === 'text') {
            // If the schema expects a string, validate directly.
            // Otherwise the LLM returned JSON-in-text — fall through to the
            // JSON parsing path below so it gets parsed first.
            const textResult = validate(llmResp.content.trim());
            if (textResult.success) return textResult;
            // Fall through to JSON parse path
          }

          // JSON: tolerant parse (handles markdown fences / surrounding prose),
          // then hand the parsed value to schema validation above.
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(llmResp.content);
          } catch {
            let cleaned = llmResp.content;
            if (cleaned.includes('```')) {
              cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
            }
            try { parsed = JSON.parse(cleaned); } catch {
              const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
              const objMatch = cleaned.match(/\{[\s\S]*\}/);
              try {
                parsed = arrayMatch ? JSON.parse(arrayMatch[0]) : objMatch ? JSON.parse(objMatch[0]) : null;
              } catch { /* give up */ }
            }
          }

          if (parsed == null) {
            const err = agentError('parse', 'executor',
              `Skill "${functionName}" returned unparseable JSON`,
              undefined,
              { functionName, preview: llmResp.content.slice(0, 200) },
            );
            return { success: false, error: toDevLog(err) };
          }

          // AI Builder structured output may wrap the payload in an object
          // (e.g. {"cards":[...]} when the schema expects a top-level array).
          // If validation fails and parsed is an object, try unwrapping:
          // 1. Find the first array-valued property and re-validate
          // 2. Try known wrapper keys
          const firstResult = validate(parsed);
          if (!firstResult.success && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const obj = parsed as Record<string, unknown>;
            // Try known wrapper keys first
            for (const key of ['cards', 'items', 'data', 'results', 'suggestions', 'insights', 'summaries']) {
              if (Array.isArray(obj[key])) {
                const unwrapped = validate(obj[key]);
                if (unwrapped.success) return unwrapped;
              }
            }
            // Fallback: first array property
            for (const v of Object.values(obj)) {
              if (Array.isArray(v)) {
                const unwrapped = validate(v);
                if (unwrapped.success) return unwrapped;
                break;
              }
            }
          }
          return firstResult;
        }

        return { success: false, error: `未知函数: ${functionName}` };
  } catch (error: unknown) {
    console.error('[FunctionExecutor] Error:', error);
    const detail = error instanceof Error ? error.message : '执行函数时发生错误';
    return {
      success: false,
      error: `[fn:${functionName}] ${detail}`,
    };
  }
}