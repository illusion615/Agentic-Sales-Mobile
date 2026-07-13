#!/usr/bin/env bash
#
# provision.sh — one-shot deployment of the Sales Copilot speech backend.
#
# Provisions, in the current Azure subscription:
#   1. An Azure AI Speech resource (F0 free tier by default)
#   2. A storage account (Function App dependency)
#   3. A Linux Consumption Function App on Node 22 that hosts the speech proxy
#      (/api/tts today; /api/stt when added) with the Speech key in app settings
#   4. The custom connector definition (so a Code App can call it via the SDK)
#
# Then it prints the two manual post-steps that must be done in the maker portal
# (create a connection) and the app repo (add-data-source), which are per-app.
#
# Prerequisites: az CLI (logged in), pac CLI (authed to the target environment),
# Node.js 20+/npm, zip. Run from the repo root or this folder.
#
# Usage:
#   ./provision.sh                       # uses the defaults below
#   RESOURCE_GROUP=my-rg LOCATION=eastasia ./provision.sh
#
set -euo pipefail

# ---- Configurable parameters (override via environment variables) -----------
RESOURCE_GROUP="${RESOURCE_GROUP:-WellsRG}"
LOCATION="${LOCATION:-eastus}"
SPEECH_NAME="${SPEECH_NAME:-sales-copilot-speech}"
SPEECH_SKU="${SPEECH_SKU:-F0}"                       # F0 free; S0 for production
FUNC_NAME="${FUNC_NAME:-sales-copilot-token}"        # must be globally unique
STORAGE_NAME="${STORAGE_NAME:-scspeechtok$RANDOM}"   # 3-24 lowercase alnum, global
NODE_VERSION="${NODE_VERSION:-22}"                   # 22 LTS — do NOT use 24 (see README)
CONNECTOR_DIR="${CONNECTOR_DIR:-../speech-connector}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

echo "==> Subscription: $(az account show --query name -o tsv)"
echo "==> RG=$RESOURCE_GROUP  LOCATION=$LOCATION  SPEECH=$SPEECH_NAME($SPEECH_SKU)  FUNC=$FUNC_NAME  STORAGE=$STORAGE_NAME  NODE=$NODE_VERSION"

# ---- 1. Speech resource -----------------------------------------------------
echo "==> [1/6] Creating Speech resource ..."
az cognitiveservices account create -n "$SPEECH_NAME" -g "$RESOURCE_GROUP" \
  --kind SpeechServices --sku "$SPEECH_SKU" -l "$LOCATION" --yes -o none
SPEECH_KEY="$(az cognitiveservices account keys list -n "$SPEECH_NAME" -g "$RESOURCE_GROUP" --query key1 -o tsv)"

# ---- 2. Storage account -----------------------------------------------------
echo "==> [2/6] Creating storage account ..."
az storage account create -n "$STORAGE_NAME" -g "$RESOURCE_GROUP" -l "$LOCATION" \
  --sku Standard_LRS --allow-blob-public-access false --min-tls-version TLS1_2 -o none

# ---- 3. Function App (Node 22 — NOT 24) -------------------------------------
echo "==> [3/6] Creating Function App (Node $NODE_VERSION) ..."
az functionapp create -n "$FUNC_NAME" -g "$RESOURCE_GROUP" \
  --storage-account "$STORAGE_NAME" --consumption-plan-location "$LOCATION" \
  --runtime node --runtime-version "$NODE_VERSION" \
  --functions-version 4 --os-type Linux --disable-app-insights true -o none
# Guard against the CLI silently defaulting to Node 24 (which fails on Consumption).
az functionapp config set -n "$FUNC_NAME" -g "$RESOURCE_GROUP" --linux-fx-version "Node|$NODE_VERSION" -o none
# Anti-abuse shared secret: the connector itself is NoAuth so users are never
# asked for a credential. The app reads this proxy key from the optional
# biz_VoiceConnectorApiKey Power Platform environment variable and includes it
# only in TTS/STT request bodies. This is NOT the Azure Speech subscription key.
# Override by exporting SPEECH_API_KEY_VALUE beforehand.
SPEECH_API_KEY_VALUE="${SPEECH_API_KEY_VALUE:-$(openssl rand -hex 32)}"
az functionapp config appsettings set -n "$FUNC_NAME" -g "$RESOURCE_GROUP" \
  --settings SPEECH_KEY="$SPEECH_KEY" SPEECH_REGION="$LOCATION" SPEECH_API_KEY="$SPEECH_API_KEY_VALUE" -o none

# ---- 4. Deploy the function via run-from-package (NOT config-zip) ------------
echo "==> [4/6] Packaging and deploying (run-from-package) ..."
npm install --omit=dev --no-audit --no-fund
rm -f /tmp/speech-broker.zip
zip -r -X /tmp/speech-broker.zip host.json package.json src node_modules >/dev/null
CONN="$(az storage account show-connection-string -n "$STORAGE_NAME" -g "$RESOURCE_GROUP" --query connectionString -o tsv)"
az storage container create -n deploy --connection-string "$CONN" -o none
az storage blob upload -c deploy -n speech-broker.zip -f /tmp/speech-broker.zip --overwrite --connection-string "$CONN" -o none
EXPIRY="$(date -u -v+2y '+%Y-%m-%dT%H:%MZ' 2>/dev/null || date -u -d '+2 years' '+%Y-%m-%dT%H:%MZ')"
SAS="$(az storage blob generate-sas -c deploy -n speech-broker.zip --permissions r --expiry "$EXPIRY" --connection-string "$CONN" --full-uri -o tsv)"
az functionapp config appsettings set -n "$FUNC_NAME" -g "$RESOURCE_GROUP" --settings WEBSITE_RUN_FROM_PACKAGE="$SAS" -o none
az functionapp restart -n "$FUNC_NAME" -g "$RESOURCE_GROUP" -o none

# ---- 5. CORS (dev-permissive; tighten for production) -----------------------
echo "==> [5/6] Enabling CORS ..."
az functionapp cors add -n "$FUNC_NAME" -g "$RESOURCE_GROUP" --allowed-origins "*" -o none || true

# ---- 6. Custom connector ----------------------------------------------------
echo "==> [6/6] Creating the custom connector ..."
# The swagger host stays environment-driven (biz_VoiceFunctionHost). A customer
# that does not deploy Speech leaves that variable blank; the app never invokes
# this connector in that environment.
pac connector create \
  --api-definition-file "$CONNECTOR_DIR/apiDefinition.swagger.json" \
  --api-properties-file "$CONNECTOR_DIR/apiProperties.json"

FUNC_HOST="$FUNC_NAME.azurewebsites.net"
cat <<EOF

============================================================
 Backend provisioned. Verify (proxy key is a request parameter):
   curl -s -X POST https://$FUNC_HOST/api/tts \\
     -H 'Content-Type: application/json' \\
     -d '{"text":"hello","locale":"en-US","apiKey":"$SPEECH_API_KEY_VALUE"}' | head -c 60
   (expect {"audio":"<base64 mp3>", ...}; without apiKey you get 401)

 >>> ENVIRONMENT ADMIN CONFIGURATION (NEVER END-USER INPUT) <<<
   Function host : https://$FUNC_HOST
   Proxy key     : $SPEECH_API_KEY_VALUE
   (The Speech SUBSCRIPTION key stays in this Function — never share it.)

 Optional Speech deployment:
   Set biz_VoiceFunctionHost and biz_VoiceConnectorApiKey to the values above,
   then create/bind the NoAuth connection (confirmation only; no credential UI).
   If Speech is not deployed, leave biz_VoiceFunctionHost blank. The app hides
   Azure Speech and never calls the connector.
============================================================
EOF
