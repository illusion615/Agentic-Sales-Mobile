import { EnvironmentvariabledefinitionsService } from '@/generated/services/EnvironmentvariabledefinitionsService';
import { EnvironmentvariablevaluesService } from '@/generated/services/EnvironmentvariablevaluesService';

export const AMAP_KEY_SCHEMA = 'biz_AMapWebServiceKey';
const LOOKUP_TIMEOUT_MS = 3500;

interface EnvironmentDefinitionLike {
  schemaname?: string;
  defaultvalue?: string;
}

interface EnvironmentValueLike {
  schemaname?: string;
  value?: string;
}

let keyCache: string | null = null;
let keyPromise: Promise<string> | null = null;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveAMapKey(
  definitions: readonly EnvironmentDefinitionLike[],
  values: readonly EnvironmentValueLike[],
): string {
  const current = values.find((row) => clean(row.schemaname) === AMAP_KEY_SCHEMA);
  const definition = definitions.find((row) => clean(row.schemaname) === AMAP_KEY_SCHEMA);
  return clean(current?.value) || clean(definition?.defaultvalue);
}

async function readAMapKey(): Promise<string> {
  const filter = `schemaname eq '${AMAP_KEY_SCHEMA}'`;
  const [definitions, values] = await Promise.all([
    EnvironmentvariabledefinitionsService.getAll({
      filter,
      select: ['environmentvariabledefinitionid', 'schemaname', 'defaultvalue'],
      top: 1,
    }),
    EnvironmentvariablevaluesService.getAll({
      filter,
      select: ['value', 'schemaname'],
      top: 1,
    }),
  ]);
  const key = resolveAMapKey(definitions.data ?? [], values.data ?? []);
  if (!key) throw new Error('管理员尚未配置高德地图服务');
  return key;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('读取地图服务配置超时')), LOOKUP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Read once per app session; the value never enters source or build artifacts. */
export function getAMapWebServiceKey(): Promise<string> {
  if (keyCache) return Promise.resolve(keyCache);
  if (!keyPromise) {
    keyPromise = withTimeout(readAMapKey())
      .then((key) => {
        keyCache = key;
        return key;
      })
      .finally(() => {
        keyPromise = null;
      });
  }
  return keyPromise;
}
