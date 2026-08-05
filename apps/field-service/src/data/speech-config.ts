import { EnvironmentvariabledefinitionsService } from '@/generated/services/EnvironmentvariabledefinitionsService';
import { EnvironmentvariablevaluesService } from '@/generated/services/EnvironmentvariablevaluesService';

const HOST_SCHEMA = 'biz_VoiceFunctionHost';
const API_KEY_SCHEMA = 'biz_VoiceConnectorApiKey';

export interface SpeechProxyConfig {
  host: string;
  apiKey: string;
  ready: boolean;
}

let cache: SpeechProxyConfig | null = null;
let pending: Promise<SpeechProxyConfig> | null = null;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveSpeechProxyConfig(
  definitions: Array<{ schemaname?: string; defaultvalue?: string }>,
  values: Array<{ schemaname?: string; value?: string }>,
): SpeechProxyConfig {
  const current = new Map(values.map((row) => [clean(row.schemaname), clean(row.value)]));
  const defaults = new Map(definitions.map((row) => [clean(row.schemaname), clean(row.defaultvalue)]));
  const effective = (schema: string) => current.get(schema) || defaults.get(schema) || '';
  const host = effective(HOST_SCHEMA);
  const apiKey = effective(API_KEY_SCHEMA);
  return { host, apiKey, ready: !!host && !!apiKey };
}

async function readConfig(): Promise<SpeechProxyConfig> {
  const filter = `schemaname eq '${HOST_SCHEMA}' or schemaname eq '${API_KEY_SCHEMA}'`;
  const [definitions, values] = await Promise.all([
    EnvironmentvariabledefinitionsService.getAll({
      filter,
      select: ['schemaname', 'defaultvalue'],
      top: 2,
    }),
    EnvironmentvariablevaluesService.getAll({
      filter,
      select: ['schemaname', 'value'],
      top: 2,
    }),
  ]);
  return resolveSpeechProxyConfig(definitions.data ?? [], values.data ?? []);
}

export async function getSpeechProxyConfig(): Promise<SpeechProxyConfig> {
  if (cache) return cache;
  if (!pending) {
    pending = readConfig()
      .catch(() => ({ host: '', apiKey: '', ready: false }))
      .then((config) => {
        cache = config;
        pending = null;
        return config;
      });
  }
  return pending;
}
