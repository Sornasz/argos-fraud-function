import {
  TRANSACTION_SCORED_EVENT_TYPE,
  TRANSACTION_SCORED_SCHEMA_VERSION,
  type TransactionScored,
} from '../application/transaction-scored.js';
import type { FraudDecision } from '../domain/fraud-decision.js';
import type { Transaction } from '../domain/transaction.js';

export interface TransactionScoredMetadata {
  readonly eventId: string;
  readonly referenceIndexVersion: string | null;
}

export function toTransactionScored(
  decision: FraudDecision,
  transaction: Transaction,
  metadata: TransactionScoredMetadata,
): TransactionScored {
  return {
    eventId: metadata.eventId,
    eventType: TRANSACTION_SCORED_EVENT_TYPE,
    schemaVersion: TRANSACTION_SCORED_SCHEMA_VERSION,
    occurredAt: decision.decidedAt.toISOString(),
    transactionId: decision.transactionId,
    decision: {
      approved: decision.approved,
      fraudScore: decision.fraudScore,
      approvalThreshold: decision.approvalThreshold,
    },
    featureVector: Array.from(decision.featureVector),
    neighbors: decision.neighbors.map((neighbor) => ({
      referenceId: neighbor.referenceId,
      distance: neighbor.distance,
      label: neighbor.label,
    })),
    referenceIndexVersion: metadata.referenceIndexVersion,
    transaction: {
      amount: transaction.amount,
      installments: transaction.installments,
      requestedAt: transaction.requestedAt.toISOString(),
      customer: {
        avgAmount: transaction.customer.avgAmount,
        txCount24h: transaction.customer.txCount24h,
        knownMerchants: [...transaction.customer.knownMerchants],
      },
      merchant: { ...transaction.merchant },
      terminal: { ...transaction.terminal },
      lastTransaction: transaction.lastTransaction && {
        timestamp: transaction.lastTransaction.timestamp.toISOString(),
        kmFromCurrent: transaction.lastTransaction.kmFromCurrent,
      },
    },
  };
}
