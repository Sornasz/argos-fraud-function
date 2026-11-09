import type { NormalizationConstants } from '../../src/features/score-transaction/domain/scoring-rules.js';
import type { Transaction } from '../../src/features/score-transaction/domain/transaction.js';

export const normalization: NormalizationConstants = {
  maxAmount: 10_000,
  maxInstallments: 12,
  amountVsAvgRatio: 10,
  maxMinutes: 1_440,
  maxKm: 1_000,
  maxTxCount24h: 20,
  maxMerchantAvgAmount: 10_000,
};

export const mccRisk = { '5411': 0.15, '7995': 0.85 } as const;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> | null : T[K] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function merge<T>(base: T, overrides: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return (overrides === undefined ? base : overrides) as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = merge(result[key], value);
  }
  return result as T;
}

/** Payload bruto no formato da API (snake_case), válido por padrão. */
export function aRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    id: 'tx-0001',
    transaction: { amount: 250, installments: 3, requested_at: '2026-10-05T12:00:00Z' },
    customer: { avg_amount: 500, tx_count_24h: 4, known_merchants: ['MERC-A', 'MERC-B'] },
    merchant: { id: 'MERC-A', mcc: '5411', avg_amount: 1_000 },
    terminal: { is_online: false, card_present: true, km_from_home: 100 },
    last_transaction: { timestamp: '2026-10-05T11:00:00Z', km_from_current: 50 },
  };
  return merge(base, overrides);
}

/** Transação de domínio. 2026-10-05 é uma segunda-feira. */
export function aTransaction(overrides: DeepPartial<Transaction> = {}): Transaction {
  const base: Transaction = {
    id: 'tx-0001',
    amount: 250,
    installments: 3,
    requestedAt: new Date('2026-10-05T12:00:00Z'),
    customer: { avgAmount: 500, txCount24h: 4, knownMerchants: ['MERC-A', 'MERC-B'] },
    merchant: { id: 'MERC-A', mcc: '5411', avgAmount: 1_000 },
    terminal: { isOnline: false, cardPresent: true, kmFromHome: 100 },
    lastTransaction: { timestamp: new Date('2026-10-05T11:00:00Z'), kmFromCurrent: 50 },
  };
  return merge(base, overrides);
}
