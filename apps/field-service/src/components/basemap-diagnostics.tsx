import { useEffect, useRef, useState } from 'react';
import {
  basemapProbeVerdict,
  formatProbeReport,
  runBasemapProbe,
  runConnectorCanvasProbe,
  runConnectorImageProbe,
  runKnownCanvasProbe,
  type ProbeResult,
} from '@/lib/basemap-probe';
import { AMapStaticMapService } from '@/generated/services/AMapStaticMapService';
import knownPngUrl from '@/assets/amap-known-probe.png?inline';
import { drawPngDataUrl } from '@/lib/png-canvas';

const CONNECTOR_PROBE_TIMEOUT_MS = 12_000;

async function connectorProbeResponse() {
  return Promise.race([
    AMapStaticMapService.GetStaticMap('114.063700,22.545500', 11, '100*100', 1),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('连接器 12 秒内未返回')), CONNECTOR_PROBE_TIMEOUT_MS),
    ),
  ]);
}

export function BasemapDiagnostics() {
  const [results, setResults] = useState<ProbeResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const verdict = results ? basemapProbeVerdict(results) : null;

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        地图底图
      </h2>
      <div className="as-settings-group">
        <div className="as-settings-item">
          <span className="flex-1 text-body">底图可用性诊断</span>
          <button
            type="button"
            disabled={running}
            onClick={async () => {
              setRunning(true);
              setCopied(false);
              try {
                const browserResults = await runBasemapProbe();
                const bundledCanvas = runKnownCanvasProbe(knownPngUrl);
                setResults([...browserResults, bundledCanvas]);

                let connectorResponse;
                try {
                  connectorResponse = await connectorProbeResponse();
                } catch (cause) {
                  connectorResponse = {
                    success: false,
                    data: undefined,
                    error: cause instanceof Error ? cause : new Error('连接器诊断异常'),
                  };
                }
                const invoke = async () => connectorResponse;
                const [connectorImage, connectorCanvas] = await Promise.all([
                  runConnectorImageProbe(invoke),
                  runConnectorCanvasProbe(invoke),
                ]);
                setResults([...browserResults, bundledCanvas, connectorImage, connectorCanvas]);
              } finally {
                setRunning(false);
              }
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          >
            {running ? '检测中…' : '运行检测'}
          </button>
        </div>

        {results?.map((result) => (
          <div key={result.id} className="as-settings-item">
            <span className="flex-1">
              <span className="block text-body">{result.label}</span>
              <span className="block text-helper">{result.hint}</span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                result.outcome === 'ok'
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
              }`}
            >
              {result.outcome === 'ok' ? '可用' : '被拦截'}
            </span>
          </div>
        ))}

        {verdict && results && (
          <div className="as-settings-item flex-col items-start gap-2">
            <p className="text-body">{verdict.summary}</p>
            <p className="text-helper">{verdict.recommendation}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(formatProbeReport(results));
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="rounded-lg bg-card px-3 py-1.5 text-sm text-foreground ring-1 ring-border"
            >
              {copied ? '已复制' : '复制结果'}
            </button>
          </div>
        )}

        {results?.some((result) => result.id === 'bundled-canvas' && result.outcome === 'ok') && (
          <div className="as-settings-item items-center gap-3">
            <KnownCanvasPreview />
            <span className="text-helper">左侧图片由 JavaScript 解码后画入 Canvas</span>
          </div>
        )}
      </div>
    </section>
  );
}

function KnownCanvasPreview() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current) drawPngDataUrl(ref.current, knownPngUrl);
  }, []);

  return <canvas ref={ref} className="h-20 w-20 shrink-0 rounded-lg ring-1 ring-border" />;
}
