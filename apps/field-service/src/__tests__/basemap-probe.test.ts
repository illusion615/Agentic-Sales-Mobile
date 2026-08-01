import { describe, expect, it } from 'vitest';
import {
  basemapProbeTargets,
  basemapProbeVerdict,
  runKnownCanvasProbe,
  runConnectorCanvasProbe,
  runConnectorImageProbe,
  runBasemapProbe,
  type ProbeId,
  type ProbeResult,
} from '@/lib/basemap-probe';

const result = (id: ProbeId, outcome: 'ok' | 'blocked'): ProbeResult => ({
  id,
  label: id,
  hint: '',
  outcome,
});

describe('runBasemapProbe', () => {
  it('reports each source kind separately', async () => {
    const results = await runBasemapProbe(async (src) => src.startsWith('data:'));
    expect(results.map((r) => r.id)).toEqual([
      'same-origin',
      'same-origin-png',
      'data-url',
      'blob-url',
      'external',
    ]);
    expect(results.find((r) => r.id === 'data-url')?.outcome).toBe('ok');
    expect(results.find((r) => r.id === 'external')?.outcome).toBe('blocked');
  });

  it('counts a source the browser cannot even construct as blocked', async () => {
    const targets = [{ id: 'blob-url' as const, label: 'blob', hint: '', createSrc: () => null }];
    const results = await runBasemapProbe(async () => true, targets);
    expect(results[0].outcome).toBe('blocked');
  });
});

describe('basemapProbeVerdict', () => {
  it('prefers the connector Canvas proof over a failed native image element', () => {
    const verdict = basemapProbeVerdict([
      result('connector-static', 'blocked'),
      result('connector-canvas', 'ok'),
    ]);
    expect(verdict.connectorImageryViable).toBe(true);
    expect(verdict.summary).toContain('Canvas');
  });

  it('treats a proven connector image as the decisive success', () => {
    const verdict = basemapProbeVerdict([
      result('external', 'blocked'),
      result('connector-static', 'ok'),
    ]);
    expect(verdict.connectorImageryViable).toBe(true);
    expect(verdict.summary).toContain('端到端可用');
  });

  it('surfaces the actual connector failure instead of the theoretical data-url result', () => {
    const connector = result('connector-static', 'blocked');
    connector.hint = 'Connection not configured';
    const verdict = basemapProbeVerdict([result('data-url', 'ok'), connector]);
    expect(verdict.connectorImageryViable).toBe(false);
    expect(verdict.recommendation).toBe('Connection not configured');
  });

  it('needs no connector when public tiles already load', () => {
    const verdict = basemapProbeVerdict([result('external', 'ok')]);
    expect(verdict.connectorImageryViable).toBe(true);
    expect(verdict.recommendation).toContain('无需连接器');
  });

  it('endorses the connector route when in-app image bytes can render', () => {
    const verdict = basemapProbeVerdict([result('external', 'blocked'), result('data-url', 'ok')]);
    expect(verdict.connectorImageryViable).toBe(true);
    expect(verdict.recommendation).toContain('静态地图');
  });

  it('rules the connector out when only bundled images render', () => {
    const verdict = basemapProbeVerdict([
      result('external', 'blocked'),
      result('data-url', 'blocked'),
      result('blob-url', 'blocked'),
      result('same-origin', 'ok'),
    ]);
    expect(verdict.connectorImageryViable).toBe(false);
    expect(verdict.recommendation).toContain('打包进应用');
  });

  it('does not claim a route when nothing renders at all', () => {
    const verdict = basemapProbeVerdict([
      result('external', 'blocked'),
      result('data-url', 'blocked'),
      result('blob-url', 'blocked'),
      result('same-origin', 'blocked'),
    ]);
    expect(verdict.connectorImageryViable).toBe(false);
  });
});

describe('runConnectorCanvasProbe', () => {
  it('proves the exact connector PNG can be drawn without an img element', async () => {
    const probe = await runConnectorCanvasProbe(
      async () => ({ success: true, data: 'iVBORw0KGgo=' }),
      (src) => src === 'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(probe.outcome).toBe('ok');
    expect(probe.hint).toContain('Canvas 绘制可用');
  });

  it('surfaces a JavaScript decoder or canvas failure', async () => {
    const probe = await runConnectorCanvasProbe(
      async () => ({ success: true, data: 'iVBORw0KGgo=' }),
      () => false,
    );
    expect(probe.outcome).toBe('blocked');
    expect(probe.hint).toContain('UPNG/Canvas');
  });
});

describe('runKnownCanvasProbe', () => {
  it('proves a bundled known PNG can be decoded without network or connector', () => {
    const probe = runKnownCanvasProbe('data:image/png;base64,known', (src) =>
      src.endsWith('known'),
    );
    expect(probe.outcome).toBe('ok');
    expect(probe.hint).toContain('无网络');
  });
});

describe('runConnectorImageProbe', () => {
  it('proves returned base64 can be decoded by the host', async () => {
    const probe = await runConnectorImageProbe(
      async () => ({ success: true, data: 'iVBORw0KGgo=' }),
      async (src) => src === 'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(probe.outcome).toBe('ok');
    expect(probe.hint).toContain('端到端可用');
  });

  it('reports an unexpected runtime response type', async () => {
    const probe = await runConnectorImageProbe(
      async () => ({ success: true, data: new ArrayBuffer(2) }),
      async () => true,
    );
    expect(probe.outcome).toBe('blocked');
    expect(probe.hint).toContain('array-buffer');
  });

  it('preserves a connector error message', async () => {
    const probe = await runConnectorImageProbe(
      async () => ({ success: false, data: undefined, error: new Error('No connection') }),
      async () => true,
    );
    expect(probe.outcome).toBe('blocked');
    expect(probe.hint).toBe('No connection');
  });
});

describe('basemapProbeTargets', () => {
  it('always offers a data: source, which is the decisive one', () => {
    const target = basemapProbeTargets().find((t) => t.id === 'data-url');
    expect(target?.createSrc()).toMatch(/^data:image\/gif;base64,/);
  });
});
