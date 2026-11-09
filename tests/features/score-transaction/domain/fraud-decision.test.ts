import { describe, expect, it } from 'vitest';
import {
  InsufficientNeighborsError,
  computeFraudScore,
  decide,
  isApproved,
} from '../../../../src/features/score-transaction/domain/fraud-decision.js';
import type { Neighbor, ReferenceLabel } from '../../../../src/features/score-transaction/domain/neighbor.js';
import { InvalidApprovalThresholdError } from '../../../../src/features/score-transaction/domain/scoring-rules.js';

function neighbors(...labels: ReferenceLabel[]): Neighbor[] {
  return labels.map((label, index) => ({ referenceId: index, distance: index / 10, label }));
}

describe('computeFraudScore', () => {
  it.each([
    [0, ['legit', 'legit', 'legit', 'legit', 'legit']],
    [0.4, ['fraud', 'legit', 'fraud', 'legit', 'legit']],
    [0.6, ['fraud', 'fraud', 'fraud', 'legit', 'legit']],
    [1, ['fraud', 'fraud', 'fraud', 'fraud', 'fraud']],
  ] as const)('retorna %s para %j', (expected, labels) => {
    expect(computeFraudScore(neighbors(...labels))).toBe(expected);
  });

  it('exige exatamente 5 vizinhos', () => {
    expect(() => computeFraudScore(neighbors('fraud', 'legit'))).toThrow(InsufficientNeighborsError);
  });
});

describe('isApproved', () => {
  it('aprova somente quando fraud_score < threshold', () => {
    expect(isApproved(0.4, 0.6)).toBe(true);
    expect(isApproved(0.6, 0.6)).toBe(false);
    expect(isApproved(3 / 5, 0.6)).toBe(false);
    expect(isApproved(0.8, 0.6)).toBe(false);
  });

  it('respeita um threshold diferente do padrão', () => {
    expect(isApproved(0.6, 0.8)).toBe(true);
    expect(isApproved(0.2, 0.2)).toBe(false);
  });

  it.each([0, -0.1, 1.2, Number.NaN])('rejeita threshold inválido %s', (threshold) => {
    expect(() => isApproved(0.2, threshold)).toThrow(InvalidApprovalThresholdError);
  });
});

describe('decide', () => {
  it('monta a decisão com score, aprovação e vizinhos usados', () => {
    const used = neighbors('fraud', 'fraud', 'legit', 'legit', 'legit');
    const decidedAt = new Date('2026-10-05T12:00:00Z');
    const featureVector = new Float32Array(14);

    const decision = decide({ transactionId: 'tx-1', featureVector, neighbors: used, approvalThreshold: 0.6, decidedAt });

    expect(decision).toEqual({
      transactionId: 'tx-1',
      fraudScore: 0.4,
      approved: true,
      approvalThreshold: 0.6,
      featureVector,
      neighbors: used,
      decidedAt,
    });
  });
});
