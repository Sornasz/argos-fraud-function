import { describe, expect, it } from 'vitest';
import type { FraudDecision } from '../../../../src/features/score-transaction/domain/fraud-decision.js';
import { ServiceBusDecisionPublisher } from '../../../../src/features/score-transaction/infrastructure/service-bus-decision-publisher.js';
import { toTransactionScored } from '../../../../src/features/score-transaction/infrastructure/transaction-scored-mapper.js';
import { aTransaction } from '../../../support/builders.js';

const decision: FraudDecision = {
  transactionId: 'tx-0001',
  fraudScore: 0.8,
  approved: false,
  approvalThreshold: 0.6,
  featureVector: new Float32Array([0.5, -1]),
  neighbors: [{ referenceId: 42, distance: 0.12, label: 'fraud' }],
  decidedAt: new Date('2026-10-05T12:00:01Z'),
};

describe('toTransactionScored', () => {
  it('serializa decisão, vizinhos e transação no contrato do evento', () => {
    const event = toTransactionScored(decision, aTransaction({ lastTransaction: null }), {
      eventId: 'evt-1',
      referenceIndexVersion: 'sha256:abc',
    });

    expect(event).toMatchObject({
      eventId: 'evt-1',
      eventType: 'TransactionScored',
      schemaVersion: 1,
      occurredAt: '2026-10-05T12:00:01.000Z',
      transactionId: 'tx-0001',
      decision: { approved: false, fraudScore: 0.8, approvalThreshold: 0.6 },
      featureVector: [0.5, -1],
      neighbors: [{ referenceId: 42, distance: 0.12, label: 'fraud' }],
      referenceIndexVersion: 'sha256:abc',
      transaction: { amount: 250, requestedAt: '2026-10-05T12:00:00.000Z', lastTransaction: null },
    });
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });
});

describe('toTransactionScored com threshold customizado', () => {
  it('grava no evento o limite usado na decisão', () => {
    const event = toTransactionScored({ ...decision, approvalThreshold: 0.75 }, aTransaction(), {
      eventId: 'evt-2',
      referenceIndexVersion: null,
    });

    expect(event.decision.approvalThreshold).toBe(0.75);
  });
});

describe('ServiceBusDecisionPublisher', () => {
  it('envia o evento usando o ID da transação como messageId', async () => {
    const sent: unknown[] = [];
    const publisher = new ServiceBusDecisionPublisher({ sendMessages: async (message) => void sent.push(message) }, () => 'v1');

    await publisher.publish(decision, aTransaction());

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      messageId: 'tx-0001',
      correlationId: 'tx-0001',
      subject: 'TransactionScored',
      contentType: 'application/json',
      body: { transactionId: 'tx-0001', referenceIndexVersion: 'v1' },
    });
  });
});
