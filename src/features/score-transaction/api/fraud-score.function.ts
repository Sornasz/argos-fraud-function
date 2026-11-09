import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import type { ScoreTransactionUseCase } from '../application/score-transaction.use-case.js';

export const INDEX_RETRY_AFTER_SECONDS = 5;

function json(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponseInit {
  return { status, jsonBody: body, headers: { 'content-type': 'application/json', ...headers } };
}

async function readJsonBody(request: HttpRequest): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: JSON.parse(await request.text()) };
  } catch {
    return { ok: false };
  }
}

export function createFraudScoreHandler(scoreTransaction: ScoreTransactionUseCase) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const body = await readJsonBody(request);
    if (!body.ok) {
      return json(400, { error: 'invalid_json', message: 'O corpo da requisição não é um JSON válido.' });
    }

    const outcome = await scoreTransaction.execute(body.value);

    switch (outcome.kind) {
      case 'invalid-request':
        context.warn(JSON.stringify({ event: 'transaction_rejected', invalidFields: outcome.invalidFields }));
        return json(400, {
          error: 'invalid_request',
          message: 'Campos obrigatórios ausentes ou em formato incorreto.',
          invalid_fields: outcome.invalidFields,
        });

      case 'index-unavailable':
        return json(
          503,
          { error: 'index_not_ready', message: 'O índice vetorial ainda está sendo carregado.' },
          { 'retry-after': String(INDEX_RETRY_AFTER_SECONDS) },
        );

      case 'scored': {
        const { decision, replayed, publishFailure } = outcome;
        const logEntry = {
          event: 'transaction_scored',
          transactionId: decision.transactionId,
          approved: decision.approved,
          fraudScore: decision.fraudScore,
          replayed,
        };
        context.info(JSON.stringify(logEntry));
        if (publishFailure) {
          context.error(
            JSON.stringify({
              event: 'transaction_scored_publish_failed',
              transactionId: decision.transactionId,
              reason: publishFailure instanceof Error ? publishFailure.message : String(publishFailure),
            }),
          );
        }
        return json(
          200,
          { approved: decision.approved, fraud_score: decision.fraudScore },
          replayed ? { 'idempotent-replayed': 'true' } : {},
        );
      }
    }
  };
}

export function registerFraudScoreFunction(scoreTransaction: ScoreTransactionUseCase): void {
  app.http('fraudScore', {
    methods: ['POST'],
    route: 'fraud-score',
    authLevel: 'function',
    handler: createFraudScoreHandler(scoreTransaction),
  });
}
