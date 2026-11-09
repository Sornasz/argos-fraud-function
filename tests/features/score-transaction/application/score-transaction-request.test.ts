import { describe, expect, it } from 'vitest';
import { parseScoreTransactionRequest } from '../../../../src/features/score-transaction/application/score-transaction-request.js';
import { aRequest } from '../../../support/builders.js';

function invalidFieldsOf(input: unknown) {
  const result = parseScoreTransactionRequest(input);
  if (result.ok) throw new Error('esperava payload inválido');
  return result.invalidFields;
}

describe('parseScoreTransactionRequest', () => {
  it('converte um payload válido para o modelo de domínio', () => {
    const result = parseScoreTransactionRequest(aRequest());

    expect(result).toEqual({
      ok: true,
      transaction: {
        id: 'tx-0001',
        amount: 250,
        installments: 3,
        requestedAt: new Date('2026-10-05T12:00:00Z'),
        customer: { avgAmount: 500, txCount24h: 4, knownMerchants: ['MERC-A', 'MERC-B'] },
        merchant: { id: 'MERC-A', mcc: '5411', avgAmount: 1_000 },
        terminal: { isOnline: false, cardPresent: true, kmFromHome: 100 },
        lastTransaction: { timestamp: new Date('2026-10-05T11:00:00Z'), kmFromCurrent: 50 },
      },
    });
  });

  it('aceita last_transaction null', () => {
    const result = parseScoreTransactionRequest(aRequest({ last_transaction: null }));

    expect(result.ok && result.transaction.lastTransaction).toBeNull();
  });

  it('lista todos os campos inválidos de uma vez', () => {
    const fields = invalidFieldsOf(
      aRequest({
        id: '',
        transaction: { amount: '10', installments: 1.5, requested_at: '11/03/2026' },
        merchant: { mcc: '54A1' },
        terminal: { is_online: 'no' },
      }),
    ).map((invalid) => invalid.field);

    expect(fields).toEqual([
      'id',
      'transaction.amount',
      'transaction.installments',
      'transaction.requested_at',
      'merchant.mcc',
      'terminal.is_online',
    ]);
  });

  it('informa o motivo de cada campo rejeitado', () => {
    const fields = invalidFieldsOf(aRequest({ transaction: { amount: -1 }, customer: { known_merchants: [1, 2] } }));

    expect(fields).toEqual([
      { field: 'transaction.amount', reason: 'deve ser maior ou igual a 0' },
      { field: 'customer.known_merchants', reason: 'deve ser uma lista de textos' },
    ]);
  });

  it('reporta só o objeto pai quando ele está ausente', () => {
    const request = aRequest();
    delete request.terminal;

    expect(invalidFieldsOf(request)).toEqual([{ field: 'terminal', reason: 'campo obrigatório' }]);
  });

  it('exige last_transaction presente, mesmo que null', () => {
    const request = aRequest();
    delete request.last_transaction;

    expect(invalidFieldsOf(request).map((invalid) => invalid.field)).toEqual(['last_transaction']);
  });

  it('valida os campos internos de last_transaction', () => {
    const fields = invalidFieldsOf(aRequest({ last_transaction: { timestamp: 'ontem', km_from_current: null } }));

    expect(fields.map((invalid) => invalid.field)).toEqual([
      'last_transaction.timestamp',
      'last_transaction.km_from_current',
    ]);
  });

  it.each([null, 'texto', 42, [1, 2]])('rejeita corpo que não é objeto: %j', (body) => {
    expect(invalidFieldsOf(body)).toEqual([{ field: 'body', reason: 'deve ser um objeto JSON' }]);
  });

  it('rejeita timestamp sem fuso horário', () => {
    const fields = invalidFieldsOf(aRequest({ transaction: { requested_at: '2026-03-11T18:45:53' } }));

    expect(fields.map((invalid) => invalid.field)).toEqual(['transaction.requested_at']);
  });

  describe('approvalThreshold opcional', () => {
    it('não aparece no resultado quando ausente', () => {
      const result = parseScoreTransactionRequest(aRequest());

      expect(result.ok && 'approvalThreshold' in result).toBe(false);
    });

    it.each([0.1, 0.6, 1])('aceita %s', (approvalThreshold) => {
      const result = parseScoreTransactionRequest(aRequest({ approvalThreshold }));

      expect(result.ok && result.approvalThreshold).toBe(approvalThreshold);
    });

    it.each([0, -0.1, 1.01, 2])('rejeita %s fora do intervalo (0, 1]', (approvalThreshold) => {
      expect(invalidFieldsOf(aRequest({ approvalThreshold }))).toEqual([
        { field: 'approvalThreshold', reason: 'deve estar no intervalo (0, 1]' },
      ]);
    });

    it.each(['0.6', null, true, {}, [0.5]])('rejeita valor que não é número: %j', (approvalThreshold) => {
      expect(invalidFieldsOf(aRequest({ approvalThreshold }))).toEqual([
        { field: 'approvalThreshold', reason: 'deve ser um número' },
      ]);
    });
  });
});
