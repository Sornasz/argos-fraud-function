import { isValidApprovalThreshold } from '../domain/scoring-rules.js';
import type { PreviousTransaction, Transaction } from '../domain/transaction.js';

export interface InvalidField {
  readonly field: string;
  readonly reason: string;
}

export type ParseScoreTransactionRequestResult =
  | { readonly ok: true; readonly transaction: Transaction; readonly approvalThreshold?: number }
  | { readonly ok: false; readonly invalidFields: InvalidField[] };

type JsonObject = Record<string, unknown>;

const MAX_ID_LENGTH = 128;
const MCC_PATTERN = /^\d{4}$/;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

class FieldReader {
  readonly invalidFields: InvalidField[] = [];

  private reject(field: string, reason: string): undefined {
    this.invalidFields.push({ field, reason });
    return undefined;
  }

  private present(parent: JsonObject | undefined, path: string): unknown {
    if (parent === undefined) return undefined;
    const value = parent[keyOf(path)];
    if (value === undefined || value === null) return this.reject(path, 'campo obrigatório');
    return value;
  }

  object(parent: JsonObject, path: string): JsonObject | undefined {
    const value = this.present(parent, path);
    if (value === undefined) return undefined;
    return isObject(value) ? value : this.reject(path, 'deve ser um objeto');
  }

  number(
    parent: JsonObject | undefined,
    path: string,
    rules: { min?: number; integer?: boolean } = {},
  ): number | undefined {
    const value = this.present(parent, path);
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) return this.reject(path, 'deve ser um número');
    if (rules.integer && !Number.isInteger(value)) return this.reject(path, 'deve ser um número inteiro');
    if (rules.min !== undefined && value < rules.min) {
      return this.reject(path, `deve ser maior ou igual a ${rules.min}`);
    }
    return value;
  }

  string(
    parent: JsonObject | undefined,
    path: string,
    rules: { maxLength?: number; pattern?: RegExp; patternHint?: string } = {},
  ): string | undefined {
    const value = this.present(parent, path);
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim() === '') return this.reject(path, 'deve ser um texto não vazio');
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return this.reject(path, `deve ter no máximo ${rules.maxLength} caracteres`);
    }
    if (rules.pattern && !rules.pattern.test(value)) {
      return this.reject(path, rules.patternHint ?? 'formato inválido');
    }
    return value;
  }

  optionalApprovalThreshold(parent: JsonObject, path: string): number | undefined {
    const value = parent[keyOf(path)];
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) return this.reject(path, 'deve ser um número');
    if (!isValidApprovalThreshold(value)) return this.reject(path, 'deve estar no intervalo (0, 1]');
    return value;
  }

  boolean(parent: JsonObject | undefined, path: string): boolean | undefined {
    const value = this.present(parent, path);
    if (value === undefined) return undefined;
    return typeof value === 'boolean' ? value : this.reject(path, 'deve ser true ou false');
  }

  timestamp(parent: JsonObject | undefined, path: string): Date | undefined {
    const value = this.present(parent, path);
    if (value === undefined) return undefined;
    const hint = 'deve ser um timestamp ISO 8601 com fuso, ex.: 2026-03-11T18:45:53Z';
    if (typeof value !== 'string' || !ISO_UTC_TIMESTAMP.test(value)) return this.reject(path, hint);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? this.reject(path, hint) : date;
  }

  stringArray(parent: JsonObject | undefined, path: string): string[] | undefined {
    const value = this.present(parent, path);
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      return this.reject(path, 'deve ser uma lista de textos');
    }
    return value as string[];
  }

  previousTransaction(root: JsonObject, path: string): PreviousTransaction | null | undefined {
    if (!(keyOf(path) in root)) return this.reject(path, 'campo obrigatório (use null quando não houver)');
    const value = root[keyOf(path)];
    if (value === null) return null;
    if (!isObject(value)) return this.reject(path, 'deve ser um objeto ou null');
    const timestamp = this.timestamp(value, `${path}.timestamp`);
    const kmFromCurrent = this.number(value, `${path}.km_from_current`, { min: 0 });
    if (timestamp === undefined || kmFromCurrent === undefined) return undefined;
    return { timestamp, kmFromCurrent };
  }
}

/**
 * Valida completude e formato do payload de POST /fraud-score (RF12) e o
 * converte para o modelo de domínio. Coleta todos os campos inválidos de uma
 * vez para que o consumidor corrija tudo numa única tentativa.
 */
export function parseScoreTransactionRequest(input: unknown): ParseScoreTransactionRequestResult {
  if (!isObject(input)) {
    return { ok: false, invalidFields: [{ field: 'body', reason: 'deve ser um objeto JSON' }] };
  }

  const read = new FieldReader();

  const id = read.string(input, 'id', { maxLength: MAX_ID_LENGTH });

  const transaction = read.object(input, 'transaction');
  const amount = read.number(transaction, 'transaction.amount', { min: 0 });
  const installments = read.number(transaction, 'transaction.installments', { min: 1, integer: true });
  const requestedAt = read.timestamp(transaction, 'transaction.requested_at');

  const customer = read.object(input, 'customer');
  const customerAvgAmount = read.number(customer, 'customer.avg_amount', { min: 0 });
  const txCount24h = read.number(customer, 'customer.tx_count_24h', { min: 0, integer: true });
  const knownMerchants = read.stringArray(customer, 'customer.known_merchants');

  const merchant = read.object(input, 'merchant');
  const merchantId = read.string(merchant, 'merchant.id');
  const mcc = read.string(merchant, 'merchant.mcc', {
    pattern: MCC_PATTERN,
    patternHint: 'deve ter 4 dígitos numéricos',
  });
  const merchantAvgAmount = read.number(merchant, 'merchant.avg_amount', { min: 0 });

  const terminal = read.object(input, 'terminal');
  const isOnline = read.boolean(terminal, 'terminal.is_online');
  const cardPresent = read.boolean(terminal, 'terminal.card_present');
  const kmFromHome = read.number(terminal, 'terminal.km_from_home', { min: 0 });

  const lastTransaction = read.previousTransaction(input, 'last_transaction');

  const approvalThreshold = read.optionalApprovalThreshold(input, 'approvalThreshold');

  if (read.invalidFields.length > 0) {
    return { ok: false, invalidFields: read.invalidFields };
  }

  return {
    ok: true,
    transaction: {
      id: id!,
      amount: amount!,
      installments: installments!,
      requestedAt: requestedAt!,
      customer: { avgAmount: customerAvgAmount!, txCount24h: txCount24h!, knownMerchants: knownMerchants! },
      merchant: { id: merchantId!, mcc: mcc!, avgAmount: merchantAvgAmount! },
      terminal: { isOnline: isOnline!, cardPresent: cardPresent!, kmFromHome: kmFromHome! },
      lastTransaction: lastTransaction as PreviousTransaction | null,
    },
    ...(approvalThreshold !== undefined && { approvalThreshold }),
  };
}
