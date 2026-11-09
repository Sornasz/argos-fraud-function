import { DEFAULT_MCC_RISK, type MccRiskTable, type NormalizationConstants } from './scoring-rules.js';
import type { Transaction } from './transaction.js';

export const FEATURE_VECTOR_DIMENSIONS = 14;

/**
 * Sentinela dos índices 5 e 6 quando não há transação anterior. O dataset de
 * referência usa o mesmo valor, então ele precisa chegar intacto ao KNN.
 */
export const NO_PREVIOUS_TRANSACTION = -1;

export type FeatureVector = Float32Array;

const MINUTE_MS = 60_000;

export function clamp(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function mccRiskFor(mcc: string, table: MccRiskTable): number {
  return Object.hasOwn(table, mcc) ? (table[mcc] as number) : DEFAULT_MCC_RISK;
}

/** Segunda-feira = 0, domingo = 6, em UTC. */
export function weekdayFromMonday(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

function amountVsAverage(amount: number, avgAmount: number, ratio: number): number {
  // A regra não define média zero; qualquer gasto acima de média nula é tratado como desvio máximo.
  if (avgAmount <= 0) return amount > 0 ? 1 : 0;
  return clamp(amount / avgAmount / ratio);
}

export function vectorize(
  transaction: Transaction,
  normalization: NormalizationConstants,
  mccRisk: MccRiskTable,
): FeatureVector {
  const { customer, merchant, terminal, lastTransaction } = transaction;
  const vector = new Float32Array(FEATURE_VECTOR_DIMENSIONS);

  vector[0] = clamp(transaction.amount / normalization.maxAmount);
  vector[1] = clamp(transaction.installments / normalization.maxInstallments);
  vector[2] = amountVsAverage(transaction.amount, customer.avgAmount, normalization.amountVsAvgRatio);
  vector[3] = transaction.requestedAt.getUTCHours() / 23;
  vector[4] = weekdayFromMonday(transaction.requestedAt) / 6;

  if (lastTransaction === null) {
    vector[5] = NO_PREVIOUS_TRANSACTION;
    vector[6] = NO_PREVIOUS_TRANSACTION;
  } else {
    const minutes = (transaction.requestedAt.getTime() - lastTransaction.timestamp.getTime()) / MINUTE_MS;
    vector[5] = clamp(minutes / normalization.maxMinutes);
    vector[6] = clamp(lastTransaction.kmFromCurrent / normalization.maxKm);
  }

  vector[7] = clamp(terminal.kmFromHome / normalization.maxKm);
  vector[8] = clamp(customer.txCount24h / normalization.maxTxCount24h);
  vector[9] = terminal.isOnline ? 1 : 0;
  vector[10] = terminal.cardPresent ? 1 : 0;
  vector[11] = customer.knownMerchants.includes(merchant.id) ? 0 : 1;
  vector[12] = mccRiskFor(merchant.mcc, mccRisk);
  vector[13] = clamp(merchant.avgAmount / normalization.maxMerchantAvgAmount);

  return vector;
}
