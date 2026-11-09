import type { FraudDecision } from '../../domain/fraud-decision.js';

export interface DecisionCache {
  get(transactionId: string): FraudDecision | undefined;
  set(transactionId: string, decision: FraudDecision): void;
}
