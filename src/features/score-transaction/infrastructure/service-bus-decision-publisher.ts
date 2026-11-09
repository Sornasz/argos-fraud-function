import { randomUUID } from 'node:crypto';
import { ServiceBusClient, type ServiceBusSender } from '@azure/service-bus';
import type { DecisionPublisher } from '../application/ports/decision-publisher.js';
import type { FraudDecision } from '../domain/fraud-decision.js';
import type { Transaction } from '../domain/transaction.js';
import { toTransactionScored } from './transaction-scored-mapper.js';

export interface ServiceBusPublisherOptions {
  readonly connectionString: string;
  readonly topicName: string;
}

export class ServiceBusDecisionPublisher implements DecisionPublisher {
  constructor(
    private readonly sender: Pick<ServiceBusSender, 'sendMessages'>,
    private readonly referenceIndexVersion: () => string | null,
  ) {}

  static create(options: ServiceBusPublisherOptions, referenceIndexVersion: () => string | null) {
    const client = new ServiceBusClient(options.connectionString);
    return new ServiceBusDecisionPublisher(client.createSender(options.topicName), referenceIndexVersion);
  }

  async publish(decision: FraudDecision, transaction: Transaction): Promise<void> {
    const event = toTransactionScored(decision, transaction, {
      eventId: randomUUID(),
      referenceIndexVersion: this.referenceIndexVersion(),
    });
    await this.sender.sendMessages({
      body: event,
      contentType: 'application/json',
      subject: event.eventType,
      // messageId = ID da transação permite que a detecção de duplicatas do
      // Service Bus descarte reenvios vindos de instâncias diferentes.
      messageId: event.transactionId,
      correlationId: event.transactionId,
      applicationProperties: { schemaVersion: event.schemaVersion },
    });
  }
}
