import { randomUUID } from 'node:crypto';
import type { TransactionScored } from '../application/transaction-scored.js';
import type { DecisionPublisher } from '../application/ports/decision-publisher.js';
import type { FraudDecision } from '../domain/fraud-decision.js';
import type { Transaction } from '../domain/transaction.js';
import { toTransactionScored } from './transaction-scored-mapper.js';

/** Publicador usado em execução local, quando não há Service Bus configurado. */
export class InMemoryDecisionPublisher implements DecisionPublisher {
  private readonly events: TransactionScored[] = [];

  constructor(
    private readonly referenceIndexVersion: () => string | null,
    private readonly capacity = 1_000,
  ) {}

  get published(): readonly TransactionScored[] {
    return this.events;
  }

  async publish(decision: FraudDecision, transaction: Transaction): Promise<void> {
    this.events.push(
      toTransactionScored(decision, transaction, {
        eventId: randomUUID(),
        referenceIndexVersion: this.referenceIndexVersion(),
      }),
    );
    if (this.events.length > this.capacity) this.events.shift();
  }
}
