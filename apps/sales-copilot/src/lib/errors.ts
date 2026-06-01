/**
 * Structured error model for the intent pipeline.
 *
 * Replaces string-concatenation error passing (`"Frame failed: ${...}"`)
 * with a typed chain that preserves layer, category, and original cause.
 */

export type AgentErrorType = 'llm' | 'parse' | 'dataverse' | 'validation' | 'transport' | 'unknown';
export type AgentErrorLayer = 'frame' | 'orchestrator' | 'executor' | 'transport' | 'context';

export interface AgentError {
  type: AgentErrorType;
  layer: AgentErrorLayer;
  message: string;
  cause?: AgentError | Error;
  context?: Record<string, unknown>;
}

/**
 * Create a structured AgentError, wrapping an optional cause.
 */
export function agentError(
  type: AgentErrorType,
  layer: AgentErrorLayer,
  message: string,
  cause?: unknown,
  context?: Record<string, unknown>,
): AgentError {
  const wrappedCause = cause instanceof Error ? cause
    : isAgentError(cause) ? cause
    : cause ? new Error(String(cause))
    : undefined;
  return { type, layer, message, cause: wrappedCause, context };
}

export function isAgentError(v: unknown): v is AgentError {
  return (
    typeof v === 'object' && v !== null &&
    'type' in v && 'layer' in v && 'message' in v
  );
}

/**
 * Walk the cause chain and return the root.
 */
export function rootCause(err: AgentError): AgentError | Error {
  let current: AgentError | Error = err;
  while (isAgentError(current) && current.cause) {
    current = current.cause;
  }
  return current;
}

/**
 * Format an AgentError into a user-facing message (hides internals).
 */
export function toUserMessage(err: AgentError, locale: 'zh-Hans' | 'en'): string {
  const messages: Record<AgentErrorType, { zh: string; en: string }> = {
    llm:        { zh: '智能服务暂时不可用，请稍后重试。', en: 'AI service temporarily unavailable. Please retry.' },
    parse:      { zh: '响应解析失败，请重试。',          en: 'Response parsing failed. Please retry.' },
    dataverse:  { zh: '数据访问失败，请检查网络后重试。', en: 'Data access failed. Please check your connection and retry.' },
    validation: { zh: '数据校验失败，请检查输入。',       en: 'Data validation failed. Please check your input.' },
    transport:  { zh: '网络传输异常，请稍后重试。',       en: 'Network error. Please retry later.' },
    unknown:    { zh: '系统异常，请重试。',              en: 'System error. Please retry.' },
  };
  const m = messages[err.type] ?? messages.unknown;
  return locale === 'zh-Hans' ? m.zh : m.en;
}

/**
 * Format for developer logging (full chain).
 */
export function toDevLog(err: AgentError): string {
  const parts = [`[${err.layer}/${err.type}] ${err.message}`];
  if (err.context) parts.push(`ctx=${JSON.stringify(err.context)}`);
  if (err.cause) {
    parts.push(isAgentError(err.cause) ? `← ${toDevLog(err.cause)}` : `← ${err.cause.message}`);
  }
  return parts.join(' ');
}
