import { EnvironmentvariabledefinitionsService } from '@/generated/services/EnvironmentvariabledefinitionsService';
import { EnvironmentvariablevaluesService } from '@/generated/services/EnvironmentvariablevaluesService';
import { withTimeout } from '@/lib/retry';

const VOICE_FUNCTION_HOST_SCHEMA = 'biz_VoiceFunctionHost';
const VOICE_CONNECTOR_API_KEY_SCHEMA = 'biz_VoiceConnectorApiKey';
const CONFIG_CHECK_TIMEOUT_MS = 3500;

export interface SpeechProxyConfig {
  host: string;
  apiKey: string;
  /** Azure Speech is usable only when this optional environment is fully configured. */
  ready: boolean;
}

interface EnvironmentDefinitionLike {
  schemaname?: string;
  defaultvalue?: string;
}

interface EnvironmentValueLike {
  schemaname?: string;
  value?: string;
}

const EMPTY_CONFIG: SpeechProxyConfig = { host: '', apiKey: '', ready: false };
let configCache: SpeechProxyConfig | null = null;
let configPromise: Promise<SpeechProxyConfig> | null = null;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Resolve current values first, then definition defaults. Exported for deterministic tests. */
export function resolveSpeechProxyConfig(
  definitions: EnvironmentDefinitionLike[],
  values: EnvironmentValueLike[]
): SpeechProxyConfig {
  const current = new Map(values.map((row) => [clean(row.schemaname), clean(row.value)]));
  const defaults = new Map(definitions.map((row) => [clean(row.schemaname), clean(row.defaultvalue)]));
  const effective = (schema: string) => current.get(schema) || defaults.get(schema) || '';
  const host = effective(VOICE_FUNCTION_HOST_SCHEMA);
  const apiKey = effective(VOICE_CONNECTOR_API_KEY_SCHEMA);
  return { host, apiKey, ready: !!host && !!apiKey };
}

async function readSpeechProxyConfig(): Promise<SpeechProxyConfig> {
  const filter =
    `schemaname eq '${VOICE_FUNCTION_HOST_SCHEMA}' or ` +
    `schemaname eq '${VOICE_CONNECTOR_API_KEY_SCHEMA}'`;
  const [definitions, values] = await Promise.all([
    EnvironmentvariabledefinitionsService.getAll({
      filter,
      select: ['environmentvariabledefinitionid', 'schemaname', 'defaultvalue'],
      top: 2,
    }),
    EnvironmentvariablevaluesService.getAll({
      filter,
      select: ['value', 'schemaname'],
      top: 2,
    }),
  ]);
  return resolveSpeechProxyConfig(definitions.data || [], values.data || []);
}

export function getSpeechProxyConfigCached(): SpeechProxyConfig | null {
  return configCache;
}

/**
 * Read the optional speech deployment once per app session.
 *
 * A blank endpoint is the primary off-switch: callers receive `ready=false` and
 * never invoke the custom connector. A configured endpoint also requires the
 * companion proxy key so an incomplete deployment fails closed without showing
 * a credential prompt to the user.
 */
export async function getSpeechProxyConfig(): Promise<SpeechProxyConfig> {
  if (configCache) return configCache;
  if (!configPromise) {
    configPromise = withTimeout(readSpeechProxyConfig(), CONFIG_CHECK_TIMEOUT_MS, 'speech proxy config lookup')
      .catch(() => EMPTY_CONFIG)
      .then((config) => {
        configCache = config;
        configPromise = null;
        return config;
      });
  }
  return configPromise;
}
