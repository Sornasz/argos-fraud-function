import type { DecisionCache } from '../application/ports/decision-cache.js';
import type { FraudDecision } from '../domain/fraud-decision.js';

export interface InMemoryDecisionCacheOptions {
  readonly ttlMs: number;
  readonly maxEntries: number;
}

interface Entry {
  readonly decision: FraudDecision;
  readonly expiresAt: number;
}

/**
 * Cache de idempotência por ID de transação (ADR-06). O `Map` preserva a ordem
 * de inserção, então a primeira chave é sempre a mais antiga e a remoção por
 * capacidade é O(1).
 */
export class InMemoryDecisionCache implements DecisionCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly options: InMemoryDecisionCacheOptions,
    private readonly nowMs: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(transactionId: string): FraudDecision | undefined {
    const entry = this.entries.get(transactionId);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.nowMs()) {
      this.entries.delete(transactionId);
      return undefined;
    }
    return entry.decision;
  }

  set(transactionId: string, decision: FraudDecision): void {
    this.entries.delete(transactionId);
    this.entries.set(transactionId, { decision, expiresAt: this.nowMs() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }
}
