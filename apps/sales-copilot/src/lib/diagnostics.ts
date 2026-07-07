/**
 * Diagnostics collector — gathers a snapshot of the environment for support and
 * debugging: user identity, device / browser, network + backend reachability,
 * wired connectors / data sources, and voice capability.
 *
 * It reads only synchronous globals plus a caller-supplied user object (the
 * Power Apps user context comes from a React hook), so it is cheap to call on
 * every render or refresh. Nothing here makes a network call — connector
 * "status" reflects what is CONFIGURED / reachable, not a live ping (a live
 * connector call would cost money and cannot run outside the deployed host).
 */
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import { isDataverseReachable } from '@/lib/connectivity';
import { hasSpeechSynthesis } from '@/lib/speech';
import { getSelectedVoice, getVoiceEngine, getDebugMode, type Locale } from '@/lib/i18n';
import { CURRENT_VERSION } from '@/data/changelog';

export type DiagTone = 'good' | 'warn' | 'bad' | 'info';

export interface BiLabel {
  zh: string;
  en: string;
}
export interface DiagRow {
  label: BiLabel;
  value: string;
  tone: DiagTone;
}
export interface DiagSection {
  title: BiLabel;
  rows: DiagRow[];
}

type UserLike = Record<string, unknown> | null | undefined;

function str(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

/** First truthy value among the given user keys. */
function pickUser(user: UserLike, keys: string[]): string {
  if (!user) return '';
  for (const k of keys) {
    const v = str(user[k]);
    if (v) return v;
  }
  return '';
}

function parseOS(ua: string, platform: string): string {
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Windows NT ([\d.]+)/))) return `Windows ${m[1]}`;
  if ((m = ua.match(/Android ([\d.]+)/))) return `Android ${m[1]}`;
  if ((m = ua.match(/(?:iPhone|iPad); CPU (?:iPhone )?OS ([\d_]+)/))) return `iOS ${m[1].replace(/_/g, '.')}`;
  if ((m = ua.match(/Mac OS X ([\d_]+)/))) return `macOS ${m[1].replace(/_/g, '.')}`;
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return platform || 'Unknown';
}

function parseBrowser(ua: string): string {
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Edg(?:iOS|A)?\/([\d.]+)/))) return `Edge ${m[1]}`;
  if ((m = ua.match(/OPR\/([\d.]+)/))) return `Opera ${m[1]}`;
  if ((m = ua.match(/HuaweiBrowser\/([\d.]+)/))) return `Huawei Browser ${m[1]}`;
  if ((m = ua.match(/SamsungBrowser\/([\d.]+)/))) return `Samsung Internet ${m[1]}`;
  if ((m = ua.match(/Firefox\/([\d.]+)/))) return `Firefox ${m[1]}`;
  if ((m = ua.match(/Chrome\/([\d.]+)/))) return `Chrome ${m[1]}`;
  if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return `Safari ${m[1]}`;
  return 'Unknown';
}

function parseModel(ua: string): string {
  const m = ua.match(/Android [\d.]+; ?([^);]+)/);
  if (m) return m[1].replace(/\s*Build\/.*$/i, '').trim() || '—';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  return '—';
}

/** Friendly label for a known non-Dataverse connector key. */
function connectorLabel(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('speech')) return 'Azure Speech (TTS)';
  if (k.includes('copilotstudio') || k.includes('copilot_studio') || k.includes('copilot')) return 'Copilot Studio';
  if (k.includes('llm')) return 'LLM Flow';
  if (k.includes('flow')) return 'Power Automate Flow';
  return key;
}

export function collectDiagnostics(input: { user?: UserLike; locale: Locale }): DiagSection[] {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const ua = str(nav.userAgent);
  const platform = str((nav as Navigator).platform);
  const conn = (nav as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection;

  // Connectors / data sources.
  const entries = Object.entries(dataSourcesInfo as Record<string, { dataSourceType?: string }>);
  const dataverse = entries.filter(([, v]) => v.dataSourceType === 'Dataverse');
  const connectors = entries.filter(([, v]) => v.dataSourceType !== 'Dataverse');
  const reachable = isDataverseReachable();
  const online = typeof nav.onLine === 'boolean' ? nav.onLine : true;

  const voices = hasSpeechSynthesis ? window.speechSynthesis.getVoices() : [];

  const sections: DiagSection[] = [
    {
      title: { zh: '应用', en: 'App' },
      rows: [
        { label: { zh: '版本', en: 'Version' }, value: CURRENT_VERSION, tone: 'good' },
        { label: { zh: '构建', en: 'Build' }, value: str(__BUILD_TIMESTAMP__), tone: 'info' },
        { label: { zh: '界面语言', en: 'Language' }, value: input.locale, tone: 'info' },
        { label: { zh: '语音引擎', en: 'Voice engine' }, value: getVoiceEngine(), tone: 'info' },
        { label: { zh: '选定音色', en: 'Selected voice' }, value: getSelectedVoice(), tone: 'info' },
        { label: { zh: '调试模式', en: 'Debug mode' }, value: getDebugMode() ? 'on' : 'off', tone: 'info' },
      ],
    },
    {
      title: { zh: '用户', en: 'User' },
      rows: [
        {
          label: { zh: '姓名', en: 'Name' },
          value: pickUser(input.user, ['fullName', 'userDisplayName', 'displayName', 'name']) || '—',
          tone: pickUser(input.user, ['fullName', 'userDisplayName', 'displayName', 'name']) ? 'good' : 'warn',
        },
        {
          label: { zh: '账号', en: 'Sign-in' },
          value: pickUser(input.user, ['userPrincipalName', 'email', 'preferredUserName']) || '—',
          tone: 'info',
        },
        { label: { zh: '对象 ID', en: 'Object ID' }, value: pickUser(input.user, ['objectId']) || '—', tone: 'info' },
        { label: { zh: '租户', en: 'Tenant' }, value: pickUser(input.user, ['tenantId', 'tenant']) || '—', tone: 'info' },
      ],
    },
    {
      title: { zh: '设备', en: 'Device' },
      rows: [
        { label: { zh: '型号', en: 'Model' }, value: parseModel(ua), tone: 'info' },
        { label: { zh: '系统', en: 'OS' }, value: parseOS(ua, platform), tone: 'info' },
        {
          label: { zh: '屏幕', en: 'Screen' },
          value: typeof screen !== 'undefined' ? `${screen.width}×${screen.height} @${window.devicePixelRatio || 1}x` : '—',
          tone: 'info',
        },
        {
          label: { zh: '视口', en: 'Viewport' },
          value: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '—',
          tone: 'info',
        },
        {
          label: { zh: '触摸', en: 'Touch' },
          value: `${str(nav.maxTouchPoints || 0)} ${(nav.maxTouchPoints || 0) > 0 ? '(touch)' : '(no touch)'}`,
          tone: 'info',
        },
        {
          label: { zh: '时区', en: 'Time zone' },
          value: (() => {
            try {
              return Intl.DateTimeFormat().resolvedOptions().timeZone || '—';
            } catch {
              return '—';
            }
          })(),
          tone: 'info',
        },
      ],
    },
    {
      title: { zh: '浏览器', en: 'Browser' },
      rows: [
        { label: { zh: '浏览器', en: 'Browser' }, value: parseBrowser(ua), tone: 'info' },
        {
          label: { zh: '系统语言', en: 'Languages' },
          value: (nav.languages && nav.languages.length ? nav.languages.join(', ') : str(nav.language)) || '—',
          tone: 'info',
        },
        { label: { zh: 'User-Agent', en: 'User-Agent' }, value: ua || '—', tone: 'info' },
      ],
    },
    {
      title: { zh: '网络', en: 'Network' },
      rows: [
        { label: { zh: '网络在线', en: 'Online' }, value: online ? 'yes' : 'no', tone: online ? 'good' : 'bad' },
        {
          label: { zh: 'Dataverse 后端', en: 'Dataverse backend' },
          value: reachable ? 'reachable' : 'unreachable',
          tone: reachable ? 'good' : 'bad',
        },
        {
          label: { zh: '连接类型', en: 'Connection' },
          value: conn?.effectiveType ? `${conn.effectiveType}${conn.downlink ? ` · ${conn.downlink}Mbps` : ''}` : '—',
          tone: 'info',
        },
      ],
    },
    {
      title: { zh: '连接器', en: 'Connectors' },
      rows: [
        {
          label: { zh: 'Dataverse 数据表', en: 'Dataverse tables' },
          value: `${dataverse.length} · ${reachable ? 'reachable' : 'unreachable'}`,
          tone: reachable ? 'good' : 'bad',
        },
        {
          label: { zh: '数据源总数', en: 'Data sources total' },
          value: str(entries.length),
          tone: 'info',
        },
        ...connectors.map(([key, v]): DiagRow => ({
          label: { zh: connectorLabel(key), en: connectorLabel(key) },
          value: `wired · ${str(v.dataSourceType) || 'connector'}`,
          tone: 'good',
        })),
      ],
    },
    {
      title: { zh: '语音', en: 'Voice' },
      rows: [
        {
          label: { zh: '本地语音合成', en: 'Local speech synthesis' },
          value: hasSpeechSynthesis ? 'available' : 'unavailable',
          tone: hasSpeechSynthesis ? 'good' : 'warn',
        },
        {
          label: { zh: '本地音色数量', en: 'Local voices' },
          value: str(voices.length),
          tone: voices.length > 0 ? 'good' : 'warn',
        },
      ],
    },
  ];

  return sections;
}

/** Render a plain-text (English) report for copy / paste to support. */
export function formatDiagnostics(sections: DiagSection[]): string {
  const lines: string[] = [];
  lines.push('=== Sales Copilot Mobile — Diagnostics ===');
  lines.push(new Date().toISOString());
  for (const s of sections) {
    lines.push('');
    lines.push(`[${s.title.en}]`);
    for (const r of s.rows) {
      lines.push(`  ${r.label.en}: ${r.value}`);
    }
  }
  return lines.join('\n');
}
