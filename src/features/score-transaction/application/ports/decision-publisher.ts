import type { FraudDecision } from '../../domain/fraud-decision.js';
import type { Transaction } from '../../domain/transaction.js';

export interface DecisionPublisher {
  publish(decision: FraudDecision, transaction: Transaction): Promise<void>;
}
