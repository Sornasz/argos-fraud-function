import { HttpRequest, InvocationContext } from '@azure/functions';
import { describe, expect, it } from 'vitest';
import type {
  ScoreTransactionOutcome,
  ScoreTransactionUseCase,
} from '../../../../src/features/score-transaction/application/score-transaction.use-case.js';
import type { FraudDecision } from '../../../../src/features/score-transaction/domain/fraud-decision.js';
import { createFraudScoreHandler } from '../../../../src/features/score-transaction/api/fraud-score.function.js';

const decision: FraudDecision = {
  transactionId: 'tx-0001',
  fraudScore: 0.8,
  approved: false,
  approvalThreshold: 0.6,
  featureVector: new Float32Array(14),
  neighbors: [],
  decidedAt: new Date(0),
};

function stubUseCase(outcome: ScoreTransactionOutcome) {
  const received: unknown[] = [];
  const useCase: ScoreTransactionUseCase = {
    execute: async (raw) => {
      received.push(raw);
      return outcome;
    },
  };
  return { useCase, received };
}

function post(body: string) {
  return new HttpRequest({ method: 'POST', url: 'http://localhost/fraud-score', body: { string: body } });
}

function silentContext() {
  return new InvocationContext({ functionName: 'fraudScore', logHandler: () => undefined });
}

describe('POST /fraud-score', () => {
  it('responde 200 com approved e fraud_score', async () => {
    const { useCase, received } = stubUseCase({ kind: 'scored', decision, replayed: false, publishFailure: null });

    const response = await createFraudScoreHandler(useCase)(post('{"id":"tx-0001"}'), silentContext());

    expect(received).toEqual([{ id: 'tx-0001' }]);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ approved: false, fraud_score: 0.8 });
    expect(response.headers).not.toHaveProperty('idempotent-replayed');
  });

  it('sinaliza no header quando a resposta veio do cache de idempotência', async () => {
    const { useCase } = stubUseCase({ kind: 'scored', decision, replayed: true, publishFailure: null });

    const response = await createFraudScoreHandler(useCase)(post('{}'), silentContext());

    expect(response.headers).toMatchObject({ 'idempotent-replayed': 'true' });
  });

  it('responde 400 listando os campos inválidos', async () => {
    const invalidFields = [
      { field: 'transaction.amount', reason: 'campo obrigatório' },
      { field: 'merchant.mcc', reason: 'deve ter 4 dígitos numéricos' },
    ];
    const { useCase } = stubUseCase({ kind: 'invalid-request', invalidFields });

    const response = await createFraudScoreHandler(useCase)(post('{}'), silentContext());

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ error: 'invalid_request', invalid_fields: invalidFields });
  });

  it('responde 400 sem chamar o caso de uso quando o corpo não é JSON', async () => {
    const { useCase, received } = stubUseCase({ kind: 'index-unavailable' });

    const response = await createFraudScoreHandler(useCase)(post('{"id":'), silentContext());

    expect(response.status).toBe(400);
    expect(response.jsonBody).toMatchObject({ error: 'invalid_json' });
    expect(received).toHaveLength(0);
  });

  it('responde 503 com Retry-After enquanto o índice carrega', async () => {
    const { useCase } = stubUseCase({ kind: 'index-unavailable' });

    const response = await createFraudScoreHandler(useCase)(post('{}'), silentContext());

    expect(response.status).toBe(503);
    expect(response.headers).toMatchObject({ 'retry-after': '5' });
  });

  it('continua respondendo 200 e registra erro quando a publicação falhou', async () => {
    const logs: Array<[string, unknown[]]> = [];
    const context = new InvocationContext({ logHandler: (level, ...args) => logs.push([level, args]) });
    const { useCase } = stubUseCase({
      kind: 'scored',
      decision,
      replayed: false,
      publishFailure: new Error('timeout no broker'),
    });

    const response = await createFraudScoreHandler(useCase)(post('{}'), context);

    expect(response.status).toBe(200);
    const errorLog = logs.find(([level]) => level === 'error');
    expect(String(errorLog?.[1][0])).toContain('timeout no broker');
  });
});
