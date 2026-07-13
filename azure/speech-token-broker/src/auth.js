const crypto = require('crypto');

/**
 * Optional shared-secret gate for the speech endpoints.
 *
 * WHY: the endpoints are reachable anonymously (the Power Apps custom connector
 * cannot do interactive OAuth), so without a gate anyone who learns the URL can
 * drive the Speech resource on the subscription owner's bill. This adds a
 * shared secret that the app reads from its optional Power Platform environment
 * configuration and sends only when it invokes a speech operation. The custom
 * connector itself is NoAuth, so creating its connection never asks an end user
 * to enter a credential.
 *
 * GRACEFUL BY DESIGN: the gate is enforced ONLY when the `SPEECH_API_KEY` app
 * setting is present. If it is absent the gate is open, so deploying this code
 * never breaks an already-running app on a flag-day — enforcement turns on the
 * moment a key is configured AND the app deployment sends it.
 *
 * Returns an HTTP error response object to short-circuit with, or `null` when
 * the request is allowed through.
 */
function checkApiKey(request, body) {
  const expected = process.env.SPEECH_API_KEY;
  if (!expected) return null; // gate disabled — anonymous allowed (dev / pre-cutover)

  // Body is the current NoAuth-connector contract. Keep the header as a
  // cutover-compatible fallback for older connector connections.
  const provided = (body && body.apiKey) || request.headers.get('x-api-key') || '';
  if (!timingSafeEqualStr(provided, expected)) {
    return { status: 401, jsonBody: { error: 'unauthorized' } };
  }
  return null;
}

/** Constant-time string compare that never throws on length mismatch. */
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { checkApiKey };
