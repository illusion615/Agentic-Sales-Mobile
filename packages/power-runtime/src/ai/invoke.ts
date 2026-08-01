/**
 * The single choke point every LLM call goes through.
 *
 * It owns what is true of any AI Builder invocation on this platform: prompt
 * serialization, the trace GUID that joins a call to its AI Event row, the call
 * ledger, response unwrapping, JSON repair and the error envelope. Because
 * every call funnels through here, the ledger sees 100% of them.
 *
 * The Dataverse call itself is injected, so this package neither imports the
 * Power Apps SDK nor knows any app's generated services.
 */
import { formatTracePrefix, newTraceId, recordAiCall } from '../ai-cost/call-log';

export type AiResponseFormat = 'text' | 'json' | 'dag' | 'json-generic';

export interface AiMessage {
  role: string;
  content: string;
}

export interface AiInvokeRequest {
  messages: AiMessage[];
  responseFormat?: AiResponseFormat;
}

export interface AiInvokeResult {
  success: boolean;
  content?: string;
  error?: string;
  latencyMs?: number;
}

/** What the injected Dataverse call returns. Mirrors the SDK's operation result. */
export interface PromptExecution {
  success: boolean;
  data?: Record<string, unknown> | null;
  error?: { message?: string };
}

export interface AiInvokeMeta {
  /** Ledger label for the call site. Defaults to the response format. */
  label?: string;
  /** Marks the call as standalone work rather than part of a user turn. */
  detached?: boolean;
  /** Called after a successful standalone call, to record its cost row. */
  onStandalone?: (traceId: string) => void;
}

export interface AiInvokerConfig {
  /** Which Custom API operation to call right now. */
  resolveOpName: () => string;
  /** Invokes the Custom API by operation name. */
  execute: (opName: string, text: string) => Promise<PromptExecution>;
  /** Build-time generated service, tried when a runtime-resolved name fails. */
  executeFallback?: (text: string) => Promise<PromptExecution>;
  /** Whether AI is switched on for this app. */
  isEnabled?: () => boolean;
  /** Repairs almost-JSON model output. Injected to keep this package dependency-free. */
  repairJson?: (raw: string) => string;
  disabledMessage?: string;
}

const B64_PREFIX = 'B64:';

/** Older Flow-based transports base64-wrapped the payload to survive UTF-8 mangling. */
function decodePayload(raw: string): string {
  if (!raw.startsWith(B64_PREFIX)) return raw;
  try {
    const binary = atob(raw.slice(B64_PREFIX.length).trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return raw;
  }
}

/** Unwraps `{ ResponsePayload: "{ predictionOutput: { text } }" }` and its variants. */
export function readPromptPayload(data: Record<string, unknown> | null | undefined): string {
  const payload = data?.ResponsePayload ?? data?.responsev2 ?? data;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as { predictionOutput?: { text?: string }; text?: string };
      return parsed?.predictionOutput?.text ?? parsed?.text ?? payload;
    } catch {
      return payload;
    }
  }
  if (typeof payload === 'object' && payload !== null) {
    const p = payload as { predictionOutput?: { text?: string }; text?: string };
    return p.predictionOutput?.text ?? p.text ?? JSON.stringify(payload);
  }
  return '';
}

export type AiInvoker = (request: AiInvokeRequest, meta?: AiInvokeMeta) => Promise<AiInvokeResult>;

export function createAiInvoker(config: AiInvokerConfig): AiInvoker {
  return async function invoke(request, meta): Promise<AiInvokeResult> {
    const startedAt = Date.now();

    if (config.isEnabled && !config.isEnabled()) {
      return {
        success: false,
        error: config.disabledMessage ?? 'AI assistant is not enabled',
        latencyMs: Date.now() - startedAt,
      };
    }

    const responseFormat: AiResponseFormat = request.responseFormat ?? 'text';
    const label = meta?.label ?? responseFormat;
    // The trace GUID sits at char 0 so it survives the AI Event prompt
    // truncation, giving an exact 1:1 join from ledger row to billed event.
    const traceId = newTraceId();
    const text = `${formatTracePrefix(traceId)}${request.messages.map((m) => `${m.role}: ${m.content}`).join('\n')}`;

    const ledger = (ok: boolean, responseChars: number) =>
      recordAiCall(
        {
          label,
          responseFormat,
          promptChars: text.length,
          responseChars,
          latencyMs: Date.now() - startedAt,
          ok,
          traceId,
        },
        { detached: !!meta?.detached },
      );

    try {
      let result = await config.execute(config.resolveOpName(), text);
      // A resolved name that fails must never leave us worse off than the
      // build-time service would have been.
      if (!result.success && config.executeFallback) {
        result = await config.executeFallback(text);
      }

      if (!result.success) {
        ledger(false, 0);
        return {
          success: false,
          error: result.error?.message ?? 'AI Builder predict failed',
          latencyMs: Date.now() - startedAt,
        };
      }

      const raw = decodePayload(readPromptPayload(result.data));
      let content = raw;
      if (responseFormat !== 'text' && config.repairJson) {
        try {
          content = config.repairJson(raw);
        } catch {
          content = raw;
        }
      }

      ledger(true, raw.length);
      if (meta?.detached) meta.onStandalone?.(traceId);
      return { success: true, content, latencyMs: Date.now() - startedAt };
    } catch (error: unknown) {
      ledger(false, 0);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error invoking AI Builder',
        latencyMs: Date.now() - startedAt,
      };
    }
  };
}
