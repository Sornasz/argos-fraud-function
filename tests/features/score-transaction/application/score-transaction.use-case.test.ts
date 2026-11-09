import { beforeEach, describe, expect, it } from 'vitest';
import { ScoreTransaction } from '../../../../src/features/score-transaction/application/score-transaction.use-case.js';
import { vectorize } from '../../../../src/features/score-transaction/domain/feature-vector.js';
import { aRequest, aTransaction, mccRisk, normalization } from '../../../support/builders.js';
import {
  FakeVectorIndex,
  FixedClock,
  FixedConfiguration,
  MapDecisionCache,
  RecordingPublisher,
  type LabeledVector,
} from '../../../support/fakes.js';

const query = Array.from(vectorize(aTransaction(), normalization, mccRisk));

/** Cópia do vetor da consulta deslocada em `delta` no índice 0. */
function near(delta: number, label: LabeledVector['label']): LabeledVector {
  const vector = [...query];
  vector[0] = vector[0]! + delta;
  return { vector, label };
}

function farFraud(): LabeledVector {
  return { vector: [0.95, 0.9, 1, 0.1, 0.8, -1, -1, 0.95, 1, 1, 0, 1, 0.85, 0.01], label: 'fraud' };
}

describe('ScoreTransaction', () => {
  let cache: MapDecisionCache;
  let publisher: RecordingPublisher;
  let configuration: FixedConfiguration;

  beforeEach(() => {
    cache = new MapDecisionCache();
    publisher = new RecordingPublisher();
    configuration = new FixedConfiguration();
  });

  function useCaseWith(index: FakeVectorIndex) {
    return new ScoreTransaction({
      vectorIndex: index,
      decisionCache: cache,
      publisher,
      configuration,
      clock: new FixedClock(),
    });
  }

  it('aprova quando a maioria dos 5 vizinhos é legítima', async () => {
    const index = new FakeVectorIndex([
      near(0.01, 'legit'),
      near(0.02, 'legit'),
      near(0.03, 'fraud'),
      near(0.04, 'legit'),
      near(0.05, 'legit'),
      farFraud(),
      farFraud(),
    ]);

    const outcome = await useCaseWith(index).execute(aRequest());

    expect(outcome.kind).toBe('scored');
    if (outcome.kind !== 'scored') return;
    expect(outcome.decision.fraudScore).toBe(0.2);
    expect(outcome.decision.approved).toBe(true);
    expect(outcome.decision.neighbors.map((neighbor) => neighbor.referenceId)).toEqual([0, 1, 2, 3, 4]);
  });

  it('nega quando 3 dos 5 vizinhos são fraude', async () => {
    const index = new FakeVectorIndex([
      near(0.01, 'fraud'),
      near(0.02, 'legit'),
      near(0.03, 'fraud'),
      near(0.04, 'fraud'),
      near(0.05, 'legit'),
      near(0.5, 'legit'),
    ]);

    const outcome = await useCaseWith(index).execute(aRequest());

    expect(outcome).toMatchObject({ kind: 'scored', decision: { fraudScore: 0.6, approved: false } });
  });

  it('usa o threshold vindo do Configuration Provider', async () => {
    configuration.approvalThreshold = 0.8;
    const index = new FakeVectorIndex([
      near(0.01, 'fraud'),
      near(0.02, 'legit'),
      near(0.03, 'fraud'),
      near(0.04, 'fraud'),
      near(0.05, 'legit'),
    ]);

    const outcome = await useCaseWith(index).execute(aRequest());

    expect(outcome).toMatchObject({ decision: { fraudScore: 0.6, approved: true, approvalThreshold: 0.8 } });
  });

  describe('approvalThreshold informado na requisição', () => {
    const fraudScoreOf06 = () =>
      new FakeVectorIndex([
        near(0.01, 'fraud'),
        near(0.02, 'legit'),
        near(0.03, 'fraud'),
        near(0.04, 'fraud'),
        near(0.05, 'legit'),
      ]);

    it('prevalece sobre o threshold da configuração', async () => {
      const outcome = await useCaseWith(fraudScoreOf06()).execute(aRequest({ approvalThreshold: 0.7 }));

      expect(outcome).toMatchObject({ decision: { fraudScore: 0.6, approved: true, approvalThreshold: 0.7 } });
    });

    it('é registrado no evento publicado', async () => {
      await useCaseWith(fraudScoreOf06()).execute(aRequest({ approvalThreshold: 0.7 }));

      expect(publisher.published[0]!.decision.approvalThreshold).toBe(0.7);
    });

    it('sem o parâmetro, a configuração é usada e registrada', async () => {
      configuration.approvalThreshold = 0.9;

      await useCaseWith(fraudScoreOf06()).execute(aRequest());

      expect(publisher.published[0]!.decision.approvalThreshold).toBe(0.9);
    });

    it('valor inválido vira invalid-request e nada é publicado', async () => {
      const outcome = await useCaseWith(fraudScoreOf06()).execute(aRequest({ approvalThreshold: 5 }));

      expect(outcome).toEqual({
        kind: 'invalid-request',
        invalidFields: [{ field: 'approvalThreshold', reason: 'deve estar no intervalo (0, 1]' }],
      });
      expect(publisher.published).toHaveLength(0);
    });
  });

  it('aproxima transações sem histórico de referências também sem histórico (-1 preservado)', async () => {
    const noHistory = vectorize(aTransaction({ lastTransaction: null }), normalization, mccRisk);
    const withSentinel = (delta: number): LabeledVector => {
      const vector = Array.from(noHistory);
      vector[0] = vector[0]! + delta;
      return { vector, label: 'fraud' };
    };
    const zeroedHistory = (delta: number): LabeledVector => {
      const vector = Array.from(noHistory);
      vector[5] = 0;
      vector[6] = 0;
      vector[13] = vector[13]! + delta;
      return { vector, label: 'legit' };
    };
    // Se o -1 fosse filtrado ou virasse zero, os vetores legítimos ficariam a
    // distância ~0 da consulta e a transação seria aprovada.
    const index = new FakeVectorIndex([
      zeroedHistory(0),
      zeroedHistory(0.001),
      zeroedHistory(0.002),
      zeroedHistory(0.003),
      zeroedHistory(0.004),
      withSentinel(0.3),
      withSentinel(0.31),
      withSentinel(0.32),
      withSentinel(0.33),
      withSentinel(0.34),
    ]);

    const outcome = await useCaseWith(index).execute(aRequest({ last_transaction: null }));

    expect(index.queries[0]![5]).toBe(-1);
    expect(index.queries[0]![6]).toBe(-1);
    expect(outcome).toMatchObject({ decision: { fraudScore: 1, approved: false } });
  });

  it('publica a decisão junto com a transação', async () => {
    const index = new FakeVectorIndex([0.01, 0.02, 0.03, 0.04, 0.05].map((d) => near(d, 'legit')));

    await useCaseWith(index).execute(aRequest());

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]!.transaction.id).toBe('tx-0001');
    expect(publisher.published[0]!.decision.approved).toBe(true);
  });

  it('devolve a decisão anterior para o mesmo ID sem recalcular nem republicar', async () => {
    const index = new FakeVectorIndex([0.01, 0.02, 0.03, 0.04, 0.05].map((d) => near(d, 'legit')));
    const useCase = useCaseWith(index);

    const first = await useCase.execute(aRequest());
    const replay = await useCase.execute(aRequest({ transaction: { amount: 9_999 } }));

    expect(replay).toMatchObject({ kind: 'scored', replayed: true });
    if (first.kind !== 'scored' || replay.kind !== 'scored') return;
    expect(replay.decision).toBe(first.decision);
    expect(index.queries).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
  });

  it('rejeita payload inválido antes de tocar no índice, no cache ou no publicador', async () => {
    const index = new FakeVectorIndex([]);

    const outcome = await useCaseWith(index).execute(aRequest({ transaction: { amount: 'muito' } }));

    expect(outcome).toEqual({
      kind: 'invalid-request',
      invalidFields: [{ field: 'transaction.amount', reason: 'deve ser um número' }],
    });
    expect(index.queries).toHaveLength(0);
    expect(cache.entries.size).toBe(0);
    expect(publisher.published).toHaveLength(0);
  });

  it('responde indisponível enquanto o índice não carregou', async () => {
    const index = new FakeVectorIndex([]);
    index.ready = false;

    const outcome = await useCaseWith(index).execute(aRequest());

    expect(outcome).toEqual({ kind: 'index-unavailable' });
    expect(cache.entries.size).toBe(0);
  });

  it('mantém a decisão quando a publicação do evento falha', async () => {
    const index = new FakeVectorIndex([0.01, 0.02, 0.03, 0.04, 0.05].map((d) => near(d, 'legit')));
    publisher.failWith = new Error('broker fora do ar');

    const outcome = await useCaseWith(index).execute(aRequest());

    expect(outcome).toMatchObject({ kind: 'scored', replayed: false, decision: { approved: true } });
    if (outcome.kind !== 'scored') return;
    expect((outcome.publishFailure as Error).message).toBe('broker fora do ar');
    expect(cache.get('tx-0001')).toBe(outcome.decision);
  });
});
