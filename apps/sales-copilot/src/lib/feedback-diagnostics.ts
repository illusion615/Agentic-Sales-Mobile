export interface SafeFeedbackDiagnostics {
  device: string;
  os: string;
  browser: string;
}

function match(ua: string, re: RegExp): string {
  return ua.match(re)?.[1] ?? '';
}

export function collectSafeFeedbackDiagnostics(
  nav: Pick<Navigator, 'userAgent' | 'platform'> = navigator,
): SafeFeedbackDiagnostics {
  const ua = nav.userAgent || '';
  const androidModel = match(ua, /Android [\d.]+; ?([^);]+)/i).replace(/\s*Build\/.*$/i, '').trim();
  const device = androidModel || (/iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : 'Desktop');

  const android = match(ua, /Android ([\d.]+)/i);
  const ios = match(ua, /(?:iPhone OS|CPU OS) ([\d_]+)/i).replace(/_/g, '.');
  const mac = match(ua, /Mac OS X ([\d_]+)/i).replace(/_/g, '.');
  const windows = match(ua, /Windows NT ([\d.]+)/i);
  const os = android ? `Android ${android}` : ios ? `iOS ${ios}` : mac ? `macOS ${mac}` : windows ? `Windows ${windows}` : nav.platform || 'Unknown';

  const edge = match(ua, /Edg(?:iOS|A)?\/([\d.]+)/i);
  const huawei = match(ua, /HuaweiBrowser\/([\d.]+)/i);
  const samsung = match(ua, /SamsungBrowser\/([\d.]+)/i);
  const firefox = match(ua, /Firefox\/([\d.]+)/i);
  const chrome = match(ua, /Chrome\/([\d.]+)/i);
  const safari = match(ua, /Version\/([\d.]+).*Safari/i);
  const browser = edge ? `Edge ${edge}` : huawei ? `Huawei Browser ${huawei}` : samsung ? `Samsung Internet ${samsung}` : firefox ? `Firefox ${firefox}` : chrome ? `Chrome ${chrome}` : safari ? `Safari ${safari}` : 'Unknown';

  return { device, os, browser };
}

/** Keep only a product page label; discard record ids, query strings, and summaries. */
export function safeFeedbackPage(pageName: string | undefined): string {
  return (pageName || 'Unknown').slice(0, 300);
}
