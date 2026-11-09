#!/usr/bin/env bash
# Cria a infra, publica a Function e testa. Sem segredos: chaves são lidas do Azure para variáveis do processo.
set -euo pipefail
cd "$(dirname "$0")/.."

RG="${RG:-rg-argos-fraud}"
LOCATION="${LOCATION:-centralus}"
DATASET_SRC="${DATASET_SRC:-$HOME/Documents/rinha-de-backend-2026-main/resources/references.json.gz}"
PAYLOADS="${PAYLOADS:-$HOME/Documents/rinha-de-backend-2026-main/resources/example-payloads.json}"
STAGE=".deploy"

[[ -f "$DATASET_SRC" ]] || { echo "dataset não encontrado: $DATASET_SRC" >&2; exit 1; }

az group create -n "$RG" -l "$LOCATION" -o none
az deployment group create -g "$RG" -f infra/main.bicep -p location="$LOCATION" -o none
APP=$(az deployment group show -g "$RG" -n main --query properties.outputs.functionAppName.value -o tsv)
HOST=$(az deployment group show -g "$RG" -n main --query properties.outputs.functionHostName.value -o tsv)

rm -rf "$STAGE" .deploy.zip
mkdir -p "$STAGE/data"
npm ci
npm run build
cp -R dist resources host.json package.json package-lock.json "$STAGE/"
cp "$DATASET_SRC" "$STAGE/data/references.json.gz"
(cd "$STAGE" && npm ci --omit=dev --silent)
(cd "$STAGE" && zip -qr ../.deploy.zip .)

az functionapp deployment source config-zip -g "$RG" -n "$APP" --src .deploy.zip -o none

BASE="https://$HOST"
echo "== GET /ready"
for _ in $(seq 1 40); do
  code=$(curl -s -o /tmp/argos_ready.json -w '%{http_code}' "$BASE/ready" || true)
  [[ "$code" == "200" ]] && break
  sleep 10
done
curl -s -w '\nstatus=%{http_code} tempo=%{time_total}s\n' "$BASE/ready"

echo "== POST /fraud-score"
KEY=""
for _ in $(seq 1 12); do
  KEY=$(az functionapp function keys list -g "$RG" -n "$APP" --function-name fraudScore --query default -o tsv 2>/dev/null || true)
  [[ -n "$KEY" ]] && break
  sleep 10
done
[[ -n "$KEY" ]] || { echo "chave da função indisponível" >&2; exit 1; }
BODY=$(python3 -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))[0]))' "$PAYLOADS")
# A chave vai por stdin para o curl: não aparece em argv, log nem arquivo.
printf 'header = "x-functions-key: %s"\n' "$KEY" | curl -s -K - -X POST "$BASE/fraud-score" \
  -H 'content-type: application/json' -d "$BODY" -w '\nstatus=%{http_code} tempo=%{time_total}s\n'
unset KEY
