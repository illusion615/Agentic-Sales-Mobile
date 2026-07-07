const { app } = require('@azure/functions');

/**
 * Speech token broker.
 *
 * Mints a short-lived (~10 minute) Azure Speech authorization token from the
 * regional STS endpoint using the subscription key held ONLY in this Function's
 * app settings (SPEECH_KEY). The front end calls GET /api/token and receives
 * { token, region } — the subscription key never leaves the server.
 *
 * CORS is configured at the Function App level (az functionapp cors), not here.
 * Response is marked no-store so the 10-minute token is never cached by proxies.
 */
app.http('token', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const key = process.env.SPEECH_KEY;
    const region = process.env.SPEECH_REGION || 'eastus';

    if (!key) {
      context.error('SPEECH_KEY app setting is missing');
      return { status: 500, jsonBody: { error: 'speech_key_not_configured' } };
    }

    try {
      const resp = await fetch(
        `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        {
          method: 'POST',
          headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Length': '0' },
        }
      );

      if (!resp.ok) {
        context.error(`issueToken failed: ${resp.status}`);
        return { status: 502, jsonBody: { error: 'issue_token_failed', upstreamStatus: resp.status } };
      }

      const token = await resp.text();
      return {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { token, region },
      };
    } catch (err) {
      context.error('token mint failed', err);
      return { status: 502, jsonBody: { error: 'token_mint_failed' } };
    }
  },
});
