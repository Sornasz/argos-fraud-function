import { describe, expect, it } from 'vitest';
import {
  FEATURE_VECTOR_DIMENSIONS,
  NO_PREVIOUS_TRANSACTION,
  clamp,
  mccRiskFor,
  vectorize,
  weekdayFromMonday,
} from '../../../../src/features/score-transaction/domain/feature-vector.js';
import { DEFAULT_MCC_RISK } from '../../../../src/features/score-transaction/domain/scoring-rules.js';
import { aTransaction, mccRisk, normalization } from '../../../support/builders.js';

function expectVector(actual: Float32Array, expected: number[]) {
  expect(actual).toHaveLength(FEATURE_VECTOR_DIMENSIONS);
  expected.forEach((value, index) => {
    expect(actual[index], `índice ${index}`).toBeCloseTo(value, 6);
  });
}

describe('vectorize', () => {
  it('aplica as 14 fórmulas de normalização na ordem definida', () => {
    const vector = vectorize(aTransaction(), normalization, mccRisk);

    expectVector(vector, [
      250 / 10_000,
      3 / 12,
      250 / 500 / 10,
      12 / 23,
      0,
      60 / 1_440,
      50 / 1_000,
      100 / 1_000,
      4 / 20,
      0,
      1,
      0,
      0.15,
      1_000 / 10_000,
    ]);
  });

  it('usa -1 nos índices 5 e 6 quando last_transaction é null, sem trocar por zero', () => {
    const vector = vectorize(aTransaction({ lastTransaction: null }), normalization, mccRisk);

    expect(vector[5]).toBe(NO_PREVIOUS_TRANSACTION);
    expect(vector[6]).toBe(NO_PREVIOUS_TRANSACTION);
    expect(vector[5]).not.toBe(0);
  });

  it('mantém os demais índices em [0, 1] mesmo sem transação anterior', () => {
    const vector = vectorize(aTransaction({ lastTransaction: null }), normalization, mccRisk);
    const others = Array.from(vector).filter((_, index) => index !== 5 && index !== 6);

    expect(others.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('limita ao teto valores acima das constantes', () => {
    const vector = vectorize(
      aTransaction({
        amount: 50_000,
        installments: 24,
        customer: { avgAmount: 100, txCount24h: 99 },
        terminal: { kmFromHome: 5_000 },
        merchant: { avgAmount: 20_000 },
        lastTransaction: { timestamp: new Date('2026-10-01T00:00:00Z'), kmFromCurrent: 3_000 },
      }),
      normalization,
      mccRisk,
    );

    for (const index of [0, 1, 2, 5, 6, 7, 8, 13]) {
      expect(vector[index], `índice ${index}`).toBe(1);
    }
  });

  it('marca comerciante desconhecido com 1 no índice 11', () => {
    const known = vectorize(aTransaction(), normalization, mccRisk);
    const unknown = vectorize(aTransaction({ merchant: { id: 'MERC-Z' } }), normalization, mccRisk);

    expect(known[11]).toBe(0);
    expect(unknown[11]).toBe(1);
  });

  it('converte is_online e card_present em 0/1', () => {
    const vector = vectorize(
      aTransaction({ terminal: { isOnline: true, cardPresent: false } }),
      normalization,
      mccRisk,
    );

    expect(vector[9]).toBe(1);
    expect(vector[10]).toBe(0);
  });

  it('trata média do cliente igual a zero sem gerar NaN', () => {
    const withSpend = vectorize(aTransaction({ customer: { avgAmount: 0 } }), normalization, mccRisk);
    const withoutSpend = vectorize(aTransaction({ amount: 0, customer: { avgAmount: 0 } }), normalization, mccRisk);

    expect(withSpend[2]).toBe(1);
    expect(withoutSpend[2]).toBe(0);
  });

  it('confere com o exemplo legítimo da especificação de detecção', () => {
    const vector = vectorize(
      aTransaction({
        amount: 41.12,
        installments: 2,
        requestedAt: new Date('2026-03-11T18:45:53Z'),
        customer: { avgAmount: 82.24, txCount24h: 3, knownMerchants: ['MERC-003', 'MERC-016'] },
        merchant: { id: 'MERC-016', mcc: '5411', avgAmount: 60.25 },
        terminal: { isOnline: false, cardPresent: true, kmFromHome: 29.23 },
        lastTransaction: null,
      }),
      normalization,
      mccRisk,
    );

    const expected = [0.0041, 0.1667, 0.05, 0.7826, 0.3333, -1, -1, 0.0292, 0.15, 0, 1, 0, 0.15, 0.006];
    expected.forEach((value, index) => expect(vector[index], `índice ${index}`).toBeCloseTo(value, 3));
  });
});

describe('weekdayFromMonday', () => {
  it('numera segunda como 0 e domingo como 6, em UTC', () => {
    expect(weekdayFromMonday(new Date('2026-10-05T00:00:00Z'))).toBe(0);
    expect(weekdayFromMonday(new Date('2026-10-11T23:59:59Z'))).toBe(6);
    expect(weekdayFromMonday(new Date('2026-10-11T23:30:00-03:00'))).toBe(0);
  });
});

describe('mccRiskFor', () => {
  it('usa o risco tabelado ou 0.5 para MCC fora da tabela', () => {
    expect(mccRiskFor('7995', mccRisk)).toBe(0.85);
    expect(mccRiskFor('0000', mccRisk)).toBe(DEFAULT_MCC_RISK);
    expect(mccRiskFor('toString', mccRisk)).toBe(DEFAULT_MCC_RISK);
  });
});

describe('clamp', () => {
  it('mantém valores em [0, 1]', () => {
    expect(clamp(-3)).toBe(0);
    expect(clamp(0.42)).toBe(0.42);
    expect(clamp(7)).toBe(1);
    expect(clamp(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clamp(Number.NaN)).toBe(0);
  });
});
