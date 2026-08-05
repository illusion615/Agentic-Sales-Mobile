/*!
 * Global fetch shim backed by curl.
 *
 * On this machine Node's HTTPS connections to the Dataverse org fail with an
 * immediate ETIMEDOUT (it prefers the org's IPv6 address, which is not routable
 * here) while curl connects fine over IPv4. Tools that call `fetch` internally —
 * notably the Power Apps CLI — are unusable as a result.
 *
 * Preload this to route fetch through curl:
 *   node --import=./scripts/curl-fetch-shim.mjs <tool> …
 *
 * Only the Dataverse/Power Platform hosts are redirected; everything else keeps
 * the native implementation.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REDIRECT_HOSTS = /\.(dynamics\.com|powerplatform\.com|powerapps\.com)$/i;
const nativeFetch = globalThis.fetch;

function curlFetch(url, init = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'curl-fetch-'));
  try {
    const headerFile = join(dir, 'h');
    const bodyFile = join(dir, 'b');
    const config = [
      `url = "${url}"`,
      `request = "${(init.method ?? 'GET').toUpperCase()}"`,
      'silent',
      'show-error',
      'globoff',
      'max-time = 300',
      `dump-header = "${headerFile}"`,
      `output = "${bodyFile}"`,
    ];

    const headers = new Headers(init.headers ?? {});
    headers.forEach((value, key) => config.push(`header = "${key}: ${value}"`));

    if (init.body !== undefined && init.body !== null) {
      const payload = typeof init.body === 'string' ? init.body : Buffer.from(init.body);
      const dataFile = join(dir, 'd');
      writeFileSync(dataFile, payload);
      config.push(`data-binary = "@${dataFile}"`);
    }

    const run = spawnSync('curl', ['--config', '-'], { input: config.join('\n') });
    if (run.status !== 0) {
      throw new TypeError(`fetch failed: curl exited ${run.status}: ${run.stderr?.toString().trim()}`);
    }

    // The last response block wins (curl appends one per redirect hop).
    const blocks = readFileSync(headerFile, 'utf8').split(/\r?\n\r?\n/).filter((b) => b.trim());
    const lines = blocks[blocks.length - 1].split(/\r?\n/);
    const status = Number(lines[0].split(' ')[1] ?? 0);
    const responseHeaders = new Headers();
    for (const line of lines.slice(1)) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      // Hop-by-hop headers describe the curl transfer, not the payload we hand back.
      if (/^(transfer-encoding|content-encoding|content-length|connection)$/i.test(name)) continue;
      try {
        responseHeaders.append(name, value);
      } catch {
        /* skip header names Headers rejects */
      }
    }
    const body = readFileSync(bodyFile);
    const hasBody = status !== 204 && status !== 304 && body.length > 0;
    return new Response(hasBody ? body : null, { status, headers: responseHeaders });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* non-absolute URL — leave it to the native implementation */
  }
  if (!host || !REDIRECT_HOSTS.test(host)) return nativeFetch(input, init);

  const request = typeof input === 'string' ? { url, ...init } : { url, ...init };
  return curlFetch(url, request);
};
