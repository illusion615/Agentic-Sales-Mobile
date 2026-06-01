/**
 * Function Executor — thin dispatcher
 *
 * All named handlers (query, draft, update, resolve, misc) are registered
 * in lib/functions/ and dispatched via the handler registry. This file
 * only contains the dispatcher + the generic LLM-backed skill fallback.
 */

import { availableFunctions } from './function-registry';
import { getHandler } from './functions/handler-registry';
// Register all domain handlers (query, draft, etc.)
import './functions';

// Re-export for existing consumers
export type { FunctionCallResult } from './functions/handler-registry';
type FnCallResult = import('./functions/handler-registry').FunctionCallResult;

/**
 * Execute a function by name with given arguments.
 */
export async function executeFunction(
  functionName: string,
  args: Record<string, unknown>,
  context: {
    userId?: string;
    userEmail?: string;
    pageContext?: { currentPage?: string; summary?: string; pageData?: unknown };
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    locale?: string;
  }
): Promise<FnCallResult> {
  console.log('[FN] ENTER executeFunction, name=' + functionName + ', args=' + JSON.stringify(args));

  // ---- Registry dispatch ----
  const registeredHandler = getHandler(functionName);
  if (registeredHandler) {
    return registeredHandler(args, context);
  }

  // ---- Fallback: generic LLM-backed skill handler ----
  try {
    const skillDef = availableFunctions.find((f) => f.name === functionName);
    if (skillDef?.llmBacked && skillDef.promptTemplate) {
      const locale = (context.locale || 'en') as 'zh-Hans' | 'en';
      const isZh = locale === 'zh-Hans';
      const systemPrompt = isZh ? skillDef.promptTemplate['zh-Hans'] : skillDef.promptTemplate['en-US'];
      const userContent = args.data as string || args.visitData as string || JSON.stringify(args);

      let fullUser = userContent;
      if (args.existingOpportunities) {
        fullUser += `\n\nExisting opportunities (for deduplication):\n${args.existingOpportunities as string}`;
      }
      if (args.entityType) {
        fullUser = `Entity type: ${args.entityType as string}\n\n${fullUser}`;
      }

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
      });

      if (!llmResp.success || !llmResp.content) {
        return { success: false, error: llmResp.error || 'LLM skill call failed' };
      }

      // Schema validation
      const validate = (value: unknown): FnCallResult => {
        if (!skillDef.outputSchema) return { success: true, data: value };
        const result = skillDef.outputSchema.safeParse(value);
        if (!result.success) {
          console.warn(`[FunctionExecutor] Skill "${functionName}" output failed schema:`, result.error.issues.slice(0, 3));
          return { success: false, error: `Skill "${functionName}" output failed its declared schema` };
        }
        return { success: true, data: result.data };
      };

      if (responseFormat === 'text') {
        const textResult = validate(llmResp.content.trim());
        if (textResult.success) return textResult;
      }

      // JSON parse with tolerance
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
        return { success: false, error: `Skill "${functionName}" returned unparseable JSON` };
      }

      // Unwrap common AI Builder wrappers
      const firstResult = validate(parsed);
      if (!firstResult.success && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        for (const key of ['cards', 'items', 'data', 'results', 'suggestions', 'insights', 'summaries']) {
          if (Array.isArray(obj[key])) {
            const unwrapped = validate(obj[key]);
            if (unwrapped.success) return unwrapped;
          }
        }
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
    return {
      success: false,
      error: error instanceof Error ? error.message : '执行函数时发生错误',
    };
  }
}

/**
 * Escape special characters for OData queries
 * - Single quotes must be doubled in OData string literals
 * - Newlines and other control characters should be normalized
 */
function escapeODataString(value: string): string {
  return value
    .replace(/'/g, "''") // Escape single quotes
    .replace(/\r\n/g, ' ') // Replace CRLF with space
    .replace(/\r/g, ' ') // Replace CR with space
    .replace(/\n/g, ' '); // Replace LF with space to avoid OData issues
}

/**
 * Sanitize object fields that contain strings to be OData-safe
 * Also filters out undefined values that could cause issues
 */
function sanitizeForOData<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    // Skip undefined values
    if (value === undefined) continue;
    
    if (typeof value === 'string') {
      sanitized[key] = escapeODataString(value);
    } else if (value !== null) {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}
