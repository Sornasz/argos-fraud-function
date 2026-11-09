#!/usr/bin/env bash
# Apaga TUDO (Function, Storage, Service Bus, Application Insights, SQL). Irreversível.
set -euo pipefail
RG="${RG:-rg-argos-fraud}"
az group delete -n "$RG" --yes --no-wait
echo "Remoção de $RG iniciada."
