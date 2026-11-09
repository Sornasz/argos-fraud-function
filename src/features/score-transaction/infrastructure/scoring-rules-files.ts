import { readFileSync } from 'node:fs';
import type { MccRiskTable, NormalizationConstants } from '../domain/scoring-rules.js';

export interface ScoringRules {
  readonly normalization: NormalizationConstants;
  readonly mccRisk: MccRiskTable;
}

const NORMALIZATION_KEYS = {
  max_amount: 'maxAmount',
  max_installments: 'maxInstallments',
  amount_vs_avg_ratio: 'amountVsAvgRatio',
  max_minutes: 'maxMinutes',
  max_km: 'maxKm',
  max_tx_count_24h: 'maxTxCount24h',
  max_merchant_avg_amount: 'maxMerchantAvgAmount',
} as const satisfies Record<string, keyof NormalizationConstants>;

function readJsonObject(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} deve conter um objeto JSON.`);
  }
  return parsed as Record<string, unknown>;
}

export function parseNormalizationConstants(raw: Record<string, unknown>, source: string): NormalizationConstants {
  const constants: Partial<Record<keyof NormalizationConstants, number>> = {};
  for (const [fileKey, field] of Object.entries(NORMALIZATION_KEYS)) {
    const value = raw[fileKey];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${source}: "${fileKey}" deve ser um número positivo.`);
    }
    constants[field] = value;
  }
  return constants as NormalizationConstants;
}

export function parseMccRiskTable(raw: Record<string, unknown>, source: string): MccRiskTable {
  const table: Record<string, number> = {};
  for (const [mcc, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || value < 0 || value > 1) {
      throw new Error(`${source}: risco do MCC "${mcc}" deve estar entre 0 e 1.`);
    }
    table[mcc] = value;
  }
  return Object.freeze(table);
}

export function loadScoringRules(paths: { normalizationPath: string; mccRiskPath: string }): ScoringRules {
  return {
    normalization: parseNormalizationConstants(readJsonObject(paths.normalizationPath), paths.normalizationPath),
    mccRisk: parseMccRiskTable(readJsonObject(paths.mccRiskPath), paths.mccRiskPath),
  };
}
