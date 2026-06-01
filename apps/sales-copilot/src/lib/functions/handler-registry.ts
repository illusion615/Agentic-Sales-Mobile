/**
 * Function Handler interface.
 * Each handler is a standalone async function registered in the handler map.
 * The executor dispatches by name — no more giant switch.
 */

export interface HandlerContext {
  userId?: string;
  userEmail?: string;
  pageContext?: {
    currentPage?: string;
    summary?: string;
    pageData?: unknown;
  };
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  locale?: string;
}

export interface FunctionCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  invalidateQueries?: string[];
}

export type FunctionHandler = (
  args: Record<string, unknown>,
  ctx: HandlerContext,
) => Promise<FunctionCallResult>;

/**
 * Central handler registry. Handler files register themselves via `registerHandler`.
 * The executor calls `getHandler(name)` at dispatch time.
 */
const registry = new Map<string, FunctionHandler>();

export function registerHandler(name: string, handler: FunctionHandler): void {
  if (registry.has(name)) {
    console.warn(`[HandlerRegistry] overwriting handler for "${name}"`);
  }
  registry.set(name, handler);
}

export function registerHandlers(handlers: Record<string, FunctionHandler>): void {
  for (const [name, handler] of Object.entries(handlers)) {
    registerHandler(name, handler);
  }
}

export function getHandler(name: string): FunctionHandler | undefined {
  return registry.get(name);
}

export function hasHandler(name: string): boolean {
  return registry.has(name);
}
