/**
 * Which kinds of image source the host actually allows.
 *
 * A Power Apps code app runs in a nested, CSP-restricted iframe, and the rules
 * differ per source kind. Knowing which kinds load decides how a street basemap
 * can be delivered at all — in particular whether wrapping a map service in a
 * custom connector (which necessarily returns bytes, not a URL) could work,
 * before anyone provisions that service.
 */
import { imagePayloadFingerprint, normalizeImagePayload } from './static-basemap';
import { drawPngDataUrl } from './png-canvas';

export type ProbeOutcome = 'ok' | 'blocked';

export type ProbeId =
  | 'same-origin'
  | 'same-origin-png'
  | 'bundled-canvas'
  | 'data-url'
  | 'blob-url'
  | 'external'
  | 'connector-static'
  | 'connector-canvas';

export interface ProbeTarget {
  id: ProbeId;
  label: string;
  hint: string;
  /** Null when the browser cannot even construct this kind of source. */
  createSrc: () => string | null;
}

export interface ProbeResult {
  id: ProbeId;
  label: string;
  hint: string;
  outcome: ProbeOutcome;
}

/** 1×1 transparent GIF — the smallest thing that still proves a decode. */
const PIXEL_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function pixelBytes(): ArrayBuffer {
  const binary = atob(PIXEL_GIF_BASE64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

export function basemapProbeTargets(): ProbeTarget[] {
  return [
    {
      id: 'same-origin',
      label: '应用自带 SVG',
      hint: '验证应用静态资源通道',
      createSrc: () => `./basemap-probe.svg?t=${Date.now()}`,
    },
    {
      id: 'same-origin-png',
      label: '应用自带高德 PNG',
      hint: '确定图片 · 100×100 · 与连接器同格式',
      createSrc: () => `./amap-known-probe.png?t=${Date.now()}`,
    },
    {
      id: 'data-url',
      label: 'data: 图片',
      hint: '决定自定义连接器方案是否可行',
      createSrc: () => `data:image/gif;base64,${PIXEL_GIF_BASE64}`,
    },
    {
      id: 'blob-url',
      label: 'blob: 图片',
      hint: '连接器方案的备选投递方式',
      createSrc: () => {
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
        try {
          return URL.createObjectURL(new Blob([pixelBytes()], { type: 'image/gif' }));
        } catch {
          return null;
        }
      },
    },
    {
      id: 'external',
      label: '外部地图瓦片',
      hint: '直接加载公网底图',
      createSrc: () => `https://basemaps.cartocdn.com/rastertiles/voyager/10/835/444.png?t=${Date.now()}`,
    },
  ];
}

export type ImageLoader = (src: string) => Promise<boolean>;

export function createImageLoader(timeoutMs = 8000): ImageLoader {
  return (src) =>
    new Promise<boolean>((resolve) => {
      if (typeof Image === 'undefined') return resolve(false);
      const image = new Image();
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.referrerPolicy = 'no-referrer';
      image.src = src;
    });
}

export async function runBasemapProbe(
  load: ImageLoader = createImageLoader(),
  targets: readonly ProbeTarget[] = basemapProbeTargets(),
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  for (const target of targets) {
    const src = target.createSrc();
    const outcome: ProbeOutcome = src === null ? 'blocked' : (await load(src)) ? 'ok' : 'blocked';
    if (src && src.startsWith('blob:') && typeof URL?.revokeObjectURL === 'function') {
      URL.revokeObjectURL(src);
    }
    results.push({ id: target.id, label: target.label, hint: target.hint, outcome });
  }

  return results;
}

export interface ConnectorImageResponse {
  success: boolean;
  data: unknown;
  error?: unknown;
}

/** Prove the whole connector → base64 → data URL → image decode path. */
export async function runConnectorImageProbe(
  invoke: () => Promise<ConnectorImageResponse>,
  load: ImageLoader = createImageLoader(),
): Promise<ProbeResult> {
  let hint = '通过 Power Platform 连接器取回并解码静态地图';
  try {
    const result = await invoke();
    if (!result.success) {
      const message =
        result.error instanceof Error
          ? result.error.message
          : typeof result.error === 'object' && result.error && 'message' in result.error
            ? String(result.error.message)
            : '连接器调用失败';
      return { id: 'connector-static', label: '高德连接器静态图', hint: message, outcome: 'blocked' };
    }

    const normalized = normalizeImagePayload(result.data);
    if (!normalized.dataUrl) {
      return {
        id: 'connector-static',
        label: '高德连接器静态图',
        hint: `不是有效 PNG · ${normalized.encoding} · ${imagePayloadFingerprint(result.data)}`,
        outcome: 'blocked',
      };
    }

    const outcome = (await load(normalized.dataUrl)) ? 'ok' : 'blocked';
    if (outcome === 'blocked') {
      hint = `已识别 ${normalized.encoding}（${normalized.length}），但 App Player 无法解码 data: 图片`;
    } else {
      hint = `端到端可用 · ${normalized.encoding} · ${normalized.length} 字节/字符`;
    }
    return { id: 'connector-static', label: '高德连接器静态图', hint, outcome };
  } catch (cause) {
    hint = cause instanceof Error ? cause.message : '连接器调用异常';
    return { id: 'connector-static', label: '高德连接器静态图', hint, outcome: 'blocked' };
  }
}

export type CanvasPngLoader = (dataUrl: string) => boolean;

export function createCanvasPngLoader(): CanvasPngLoader {
  return (dataUrl) => {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    return drawPngDataUrl(canvas, dataUrl);
  };
}

export function runKnownCanvasProbe(
  dataUrl: string,
  draw: CanvasPngLoader = createCanvasPngLoader(),
): ProbeResult {
  const outcome = draw(dataUrl) ? 'ok' : 'blocked';
  return {
    id: 'bundled-canvas',
    label: '应用自带高德 PNG → Canvas',
    hint:
      outcome === 'ok'
        ? '确定图片 · 无网络 · 无连接器 · JS 解码 + Canvas 可用'
        : '确定图片的 UPNG/Canvas 绘制失败',
    outcome,
  };
}

/** Prove connector bytes can bypass the host image decoder and reach Canvas. */
export async function runConnectorCanvasProbe(
  invoke: () => Promise<ConnectorImageResponse>,
  draw: CanvasPngLoader = createCanvasPngLoader(),
): Promise<ProbeResult> {
  try {
    const result = await invoke();
    if (!result.success) {
      const message =
        result.error instanceof Error ? result.error.message : '连接器调用失败';
      return { id: 'connector-canvas', label: '高德连接器 Canvas', hint: message, outcome: 'blocked' };
    }

    const normalized = normalizeImagePayload(result.data);
    if (!normalized.dataUrl) {
      return {
        id: 'connector-canvas',
        label: '高德连接器 Canvas',
        hint: `不是有效 PNG · ${imagePayloadFingerprint(result.data)}`,
        outcome: 'blocked',
      };
    }

    const outcome = draw(normalized.dataUrl) ? 'ok' : 'blocked';
    return {
      id: 'connector-canvas',
      label: '高德连接器 Canvas',
      hint:
        outcome === 'ok'
          ? `JS 解码 + Canvas 绘制可用 · ${normalized.encoding} · ${normalized.length}`
          : `UPNG/Canvas 绘制失败 · ${normalized.encoding} · ${normalized.length}`,
      outcome,
    };
  } catch (cause) {
    return {
      id: 'connector-canvas',
      label: '高德连接器 Canvas',
      hint: cause instanceof Error ? cause.message : 'Canvas 诊断异常',
      outcome: 'blocked',
    };
  }
}

export interface ProbeVerdict {
  /** Whether bytes returned by a connector could be shown as a map image. */
  connectorImageryViable: boolean;
  summary: string;
  recommendation: string;
}

export function basemapProbeVerdict(results: readonly ProbeResult[]): ProbeVerdict {
  const ok = (id: ProbeId) => results.some((r) => r.id === id && r.outcome === 'ok');
  const connector = results.find((r) => r.id === 'connector-static');
  const connectorCanvas = results.find((r) => r.id === 'connector-canvas');

  if (connectorCanvas?.outcome === 'ok') {
    return {
      connectorImageryViable: true,
      summary: '高德连接器 Canvas 端到端可用。',
      recommendation: 'Native App Player 的 PNG <img> 解码不可用，但 JavaScript 解码后可由 Canvas 绘制；首页已使用此路径。',
    };
  }

  if (connectorCanvas?.outcome === 'blocked') {
    return {
      connectorImageryViable: false,
      summary: '高德连接器 Canvas 端到端失败。',
      recommendation: connectorCanvas.hint,
    };
  }

  if (connector?.outcome === 'ok') {
    return {
      connectorImageryViable: true,
      summary: '高德连接器静态图端到端可用。',
      recommendation: 'App Player 能显示连接器底图；若首页仍无图，问题在地图触发或布局状态。',
    };
  }

  if (connector?.outcome === 'blocked') {
    return {
      connectorImageryViable: false,
      summary: '高德连接器端到端失败。',
      recommendation: connector.hint,
    };
  }

  if (ok('external')) {
    return {
      connectorImageryViable: true,
      summary: '公网底图可直接加载。',
      recommendation: '无需连接器，当前底图方案即可用。',
    };
  }

  if (ok('data-url') || ok('blob-url')) {
    return {
      connectorImageryViable: true,
      summary: '公网被拦截，但应用内生成的图片可以显示。',
      recommendation: '可用自定义连接器封装地图服务：连接器取回图片字节，应用转成图片显示。建议用「静态地图」接口，一次请求换一整幅底图，而不是逐张瓦片。',
    };
  }

  if (ok('same-origin')) {
    return {
      connectorImageryViable: false,
      summary: '只有随应用打包的图片能显示。',
      recommendation: '连接器方案无效。需要把服务区域底图预先打包进应用，或改用内置矢量底图绘制。',
    };
  }

  return {
    connectorImageryViable: false,
    summary: '当前环境未能显示任何图片。',
    recommendation: '请确认诊断是否在受限网络下运行，并复制结果供进一步排查。',
  };
}

export function formatProbeReport(results: readonly ProbeResult[]): string {
  const verdict = basemapProbeVerdict(results);
  const lines = results.map((r) => `${r.outcome === 'ok' ? '可用' : '被拦截'}\t${r.label}`);
  return [...lines, '', verdict.summary, verdict.recommendation].join('\n');
}
