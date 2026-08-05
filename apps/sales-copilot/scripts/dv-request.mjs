/*!
 * Dataverse Web API transport for the provisioning scripts.
 *
 * Uses curl rather than global fetch: on this network Node's HTTPS connections
 * to the org fail with an immediate ETIMEDOUT (it prefers the org's IPv6
 * address, which is not routable here, and even ipv4first stays intermittent),
 * while curl connects reliably over IPv4. The token is passed through a curl
 * config on stdin so it never appears in the process arguments.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createDataverseClient({ url, token, solution }) {
  if (!url || !token) throw new Error('Missing Dataverse url or token.');
  const base = `${url.replace(/\/$/, '')}/api/data/v9.2`;

  function request(method, path, body, extraHeaders = {}) {
    const raw = path.startsWith('http') ? path : `${base}/${path.replace(/^\//, '')}`;
    // OData filters are written with spaces for readability; curl needs them encoded.
    const target = raw.replace(/ /g, '%20');
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...(solution ? { 'MSCRM.SolutionUniqueName': solution } : {}),
      ...extraHeaders,
    };

    let dir;
    try {
      const lines = [
        `url = "${target}"`,
        `request = "${method}"`,
        ...Object.entries(headers).map(([k, v]) => `header = "${k}: ${v}"`),
        'silent',
        'show-error',
        'globoff',
        'max-time = 120',
        'write-out = "\\n%{http_code}"',
      ];
      if (body !== undefined) {
        dir = mkdtempSync(join(tmpdir(), 'dv-'));
        const file = join(dir, 'body.json');
        writeFileSync(file, JSON.stringify(body));
        lines.push(`data-binary = "@${file}"`);
      }
      const out = execFileSync('curl', ['--config', '-'], {
        input: lines.join('\n'),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      const cut = out.lastIndexOf('\n');
      const status = Number(out.slice(cut + 1).trim());
      const text = out.slice(0, cut);
      let json;
      if (text.trim()) {
        try {
          json = JSON.parse(text);
        } catch {
          /* non-JSON body (empty 204, HTML error page) */
        }
      }
      return { status, ok: status >= 200 && status < 300, text, json };
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  }

  return {
    request,
    get: (path, extraHeaders) => request('GET', path, undefined, extraHeaders),
    post: (path, body, extraHeaders) => request('POST', path, body ?? {}, extraHeaders),
    patch: (path, body, extraHeaders) => request('PATCH', path, body, extraHeaders),
    del: (path, extraHeaders) => request('DELETE', path, undefined, extraHeaders),
    exists: (path) => request('GET', path).status === 200,
  };
}

export function readEnv() {
  const url = process.env.DV_URL?.replace(/\/$/, '');
  const token = process.env.DV_TOKEN;
  if (!url || !token) {
    console.error(
      'Missing DV_URL or DV_TOKEN.\n' +
        '  DV_URL="https://<org>.crm.dynamics.com" \\\n' +
        '  DV_TOKEN="$(az account get-access-token --resource https://<org>.crm.dynamics.com/ --query accessToken -o tsv)" \\\n' +
        '  node scripts/<script>.mjs',
    );
    process.exit(1);
  }
  return { url, token };
}
