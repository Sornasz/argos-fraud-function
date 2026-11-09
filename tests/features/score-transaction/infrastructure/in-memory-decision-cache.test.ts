import { describe, expect, it } from 'vitest';
import type { FraudDecision } from '../../../../src/features/score-transaction/domain/fraud-decision.js';
import { InMemoryDecisionCache } from '../../../../src/features/score-transaction/infrastructure/in-memory-decision-cache.js';

function decision(transactionId: string): FraudDecision {
  return {
    transactionId,
    fraudScore: 0,
    approved: true,
    approvalThreshold: 0.6,
    featureVector: new Float32Array(14),
    neighbors: [],
    decidedAt: new Date(0),
  };
}

describe('InMemoryDecisionCache', () => {
  it('guarda e devolve a decisão pelo ID da transação', () => {
    const cache = new InMemoryDecisionCache({ ttlMs: 1_000, maxEntries: 10 });
    const stored = decision('tx-1');

    cache.set('tx-1', stored);

    expect(cache.get('tx-1')).toBe(stored);
    expect(cache.get('tx-2')).toBeUndefined();
  });

  it('expira entradas após o TTL', () => {
    let now = 0;
    const cache = new InMemoryDecisionCache({ ttlMs: 1_000, maxEntries: 10 }, () => now);
    cache.set('tx-1', decision('tx-1'));

    now = 999;
    expect(cache.get('tx-1')).toBeDefined();
    now = 1_000;
    expect(cache.get('tx-1')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('descarta a entrada mais antiga ao passar da capacidade', () => {
    const cache = new InMemoryDecisionCache({ ttlMs: 60_000, maxEntries: 2 });
    cache.set('tx-1', decision('tx-1'));
    cache.set('tx-2', decision('tx-2'));
    cache.set('tx-3', decision('tx-3'));

    expect(cache.get('tx-1')).toBeUndefined();
    expect(cache.get('tx-2')).toBeDefined();
    expect(cache.get('tx-3')).toBeDefined();
  });
});
