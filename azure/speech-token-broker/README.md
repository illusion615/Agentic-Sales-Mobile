# Speech Proxy (Azure Function + Custom Connector)

An Azure Function that runs Azure Speech **server-side** for the Agentic Sales
Mobile Code App. The Speech subscription key lives ONLY in this Function's app
settings; the app never holds it and never calls Azure directly.

**Why a server-side proxy + connector?** The Power Apps Code App runs in a
`connect-src 'none'` iframe sandbox — the app's JavaScript cannot make any
direct external network call (fetch or WebSocket). So it reaches Azure Speech
only through a **custom connector**, invoked via the Power Apps SDK
(`getClient().executeAsync({ connectorOperation })`), which the Power Apps host
proxies on the app's behalf.

Operations:
- `POST /api/tts` — text-to-speech. `{ text, locale?, voice? }` -> `{ audio: <base64 mp3>, format, voice, locale }`. (Live.)
- `POST /api/stt` — speech-to-text, batch press-to-record. (Planned.)
- `GET /api/token` — legacy token minter, now unused (client-side tokens are blocked by the sandbox).

Front-end call site: `apps/sales-copilot/src/generated/services/SalesCopilotSpeechService.ts`
(`SalesCopilotSpeechService.Synthesize(...)`).

---

## Quick deploy

```bash
cd azure/speech-token-broker
./provision.sh          # or: RESOURCE_GROUP=my-rg LOCATION=eastasia ./provision.sh
```

`provision.sh` creates the Speech resource, storage, Function App (Node 22),
deploys the code, enables CORS, and creates the custom connector — then prints
the two manual post-steps (create a connection in the maker portal, then
`add-data-source` into the app). The manual sections below explain each step for
those who prefer to run them by hand or need to understand what the script does.

---

## Required Azure + Power Platform resources

| Resource | Purpose | Tier (dev) | Notes |
|---|---|---|---|
| Azure AI Speech (`Microsoft.CognitiveServices`, kind `SpeechServices`) | Speech-to-text + Neural text-to-speech | **F0 (free)** | Free: ~5 audio hours STT + 0.5M chars TTS/month. **S0** for production. |
| Azure Function App (Linux, Consumption) | Server-side speech proxy (holds the key) | Consumption (~free at low volume) | **Node 22** — see the gotcha below. |
| Storage account (Standard_LRS) | Function App runtime dependency | Standard_LRS | Required by every Function App. |
| Custom connector | Lets the Code App call the Function via the SDK (bypasses the sandbox) | — | `pac connector create` from `azure/speech-connector`. |
| Connection (NoAuth) | The connector instance the app binds to | — | Maker-portal action (not scriptable for NoAuth). |

Reference deployment used resource group **`WellsRG`** (region **`eastus`**).
Change the names/region for a new environment.

---

## Prerequisites

- Azure CLI logged in: `az login` (confirm with `az account show`).
- The subscription must have the `Microsoft.CognitiveServices` provider
  registered: `az provider show -n Microsoft.CognitiveServices --query registrationState`.

---

## Provisioning (step by step)

### 1. Speech resource (F0 free)

```bash
az cognitiveservices account create \
  -n sales-copilot-speech -g WellsRG \
  --kind SpeechServices --sku F0 -l eastus --yes
```

Validate the token path (prints an HTTP 200 + a JWT; do NOT print the key):

```bash
KEY=$(az cognitiveservices account keys list -n sales-copilot-speech -g WellsRG --query key1 -o tsv)
curl -s -X POST "https://eastus.api.cognitive.microsoft.com/sts/v1.0/issueToken" \
  -H "Ocp-Apim-Subscription-Key: $KEY" -H "Content-Length: 0" -w "\nHTTP %{http_code}\n" -o /dev/null
```

### 2. Storage account + Function App

```bash
az storage account create -n scspeechtok279487 -g WellsRG -l eastus \
  --sku Standard_LRS --allow-blob-public-access false --min-tls-version TLS1_2

az functionapp create -n sales-copilot-token -g WellsRG \
  --storage-account scspeechtok279487 \
  --consumption-plan-location eastus \
  --runtime node --runtime-version 22 \
  --functions-version 4 --os-type Linux --disable-app-insights true
```

> **GOTCHA — use Node 22, not 24.** The CLI may push you to Node 24 ("20 has
> reached end-of-life"), but Node 24 currently fails to start on Linux
> Consumption (persistent HTTP 503, `function list` returns Bad Request). Node
> 22 (LTS) works. If you already created the app on 24, fix it in place:
> `az functionapp config set -n sales-copilot-token -g WellsRG --linux-fx-version "Node|22" && az functionapp restart -n sales-copilot-token -g WellsRG`.

### 3. App settings (the key stays here, server-side)

```bash
KEY=$(az cognitiveservices account keys list -n sales-copilot-speech -g WellsRG --query key1 -o tsv)
az functionapp config appsettings set -n sales-copilot-token -g WellsRG \
  --settings SPEECH_KEY="$KEY" SPEECH_REGION=eastus
```

### 4. Deploy (run-from-package)

`config-zip` and `az functionapp deploy` (OneDeploy) both go through Kudu/SCM,
which returns **Bad Request / 503** on a freshly-created Linux Consumption app.
The reliable method is **run-from-package** (the app pulls a zip from a blob SAS
URL at startup):

```bash
cd azure/speech-token-broker
npm install --omit=dev                       # bundle @azure/functions
zip -r -X /tmp/speech-broker.zip host.json package.json src node_modules

CONN=$(az storage account show-connection-string -n scspeechtok279487 -g WellsRG --query connectionString -o tsv)
az storage container create -n deploy --connection-string "$CONN"
az storage blob upload -c deploy -n speech-broker.zip -f /tmp/speech-broker.zip --overwrite --connection-string "$CONN"
EXPIRY=$(date -u -v+2y '+%Y-%m-%dT%H:%MZ')   # macOS/BSD date; on Linux: date -u -d '+2 years' '+%Y-%m-%dT%H:%MZ'
SAS=$(az storage blob generate-sas -c deploy -n speech-broker.zip --permissions r --expiry "$EXPIRY" --connection-string "$CONN" --full-uri -o tsv)

az functionapp config appsettings set -n sales-copilot-token -g WellsRG --settings WEBSITE_RUN_FROM_PACKAGE="$SAS"
az functionapp restart -n sales-copilot-token -g WellsRG
```

Re-run the last two commands (re-upload + re-set SAS or just re-upload to the
same blob) whenever the function code changes.

### 5. CORS

```bash
# Dev: permissive so localhost + the Power Apps player can call it.
az functionapp cors add -n sales-copilot-token -g WellsRG --allowed-origins "*"
```

### 6. Verify the Function

```bash
curl -s -X POST "https://sales-copilot-token.azurewebsites.net/api/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello","locale":"en-US"}' | head -c 60
# Expect {"audio":"<base64 mp3>","format":"mp3", ...}
```

### 7. Custom connector

The Code App cannot call the Function with `fetch` (sandbox), so expose it as a
custom connector. The connector definition lives in `azure/speech-connector/`
(`apiDefinition.swagger.json` + `apiProperties.json`, NoAuth).

```bash
cd ../speech-connector
pac connector create \
  --api-definition-file apiDefinition.swagger.json \
  --api-properties-file apiProperties.json
```

### 8. Connection (maker portal — manual)

NoAuth connections are not scriptable via `pac`. In the maker portal:
**Connections -> + New connection -> "Sales Copilot Speech" -> Create**
(creates instantly, no credentials). Then grab its id:

```bash
pac connection list   # note the Id and the /providers/.../apis/shared_... apiId
```

### 9. Wire the connector into the Code App

Use the npm Power Apps CLI (the `pac code add-data-source` path is unreliable):

```bash
cd ../../apps/sales-copilot
BIN=$(find node_modules/.pnpm -path "*@microsoft/power-apps-cli/dist/Bin.js" | head -1)
node "$BIN" add-data-source \
  --api-id shared_<connector-apiId> \
  --connection-id <connectionId> \
  --org-url https://<your-org>.crm.dynamics.com/ --non-interactive
# Generates src/generated/services/SalesCopilotSpeechService.ts + power.config.json entry.
# Then: pnpm build && pac code push
```

---

## Security — anti-abuse shared secret

The endpoints are anonymous at the HTTP layer (the Power Apps custom connector
cannot do interactive OAuth), so a **shared-secret gate** protects them:

- Set a strong `SPEECH_API_KEY` app setting on the Function. When present, every
  `/tts` and `/stt` call must carry a matching **`x-api-key`** header or it gets
  **401**. When the setting is absent the gate is open (graceful — deploying the
  code never breaks a running app; enforcement turns on only once the key is set
  AND the connection sends it). `provision.sh` mints and sets this key
  automatically for new deployments (`openssl rand -hex 32`).
- The custom connector uses **API-key auth** (`securityDefinitions` header
  `x-api-key`), so the key is stored on the connection and sent on every call.
- Still recommended before go-live: narrow **CORS** from `*` to the exact Power
  Apps origins, and add a per-IP / per-minute **rate limit**.

The Speech **subscription key** stays only in `SPEECH_KEY`, server-side; it never
reaches the front end and is never shared with whoever wires the app.

### Cutover for an already-running Function (was anonymous)

1. `az functionapp config appsettings set -n <func> -g <rg> --settings SPEECH_API_KEY="$(openssl rand -hex 32)"` (note the value).
2. Update the custom connector to API-key auth (`pac connector update` with the new swagger) and **re-create the connection**, entering that key.
3. Verify: `curl .../api/tts -H "x-api-key: <key>" ...` returns audio; without the header, 401.

## Front-end integration

The app calls the connector through the Power Apps SDK (never `fetch`):
`apps/sales-copilot/src/generated/services/SalesCopilotSpeechService.ts`
exposes `Synthesize({ text, locale, voice })`, which runs
`getClient().executeAsync({ connectorOperation: { operationName: 'Synthesize' } })`
and returns `{ audio: <base64 mp3>, format, voice, locale }`. The app decodes
the base64 into an `<audio>` element to play it.

> `src/lib/speech-token.ts` and `GET /api/token` are legacy (client-side tokens
> are blocked by the sandbox) and can be removed.
