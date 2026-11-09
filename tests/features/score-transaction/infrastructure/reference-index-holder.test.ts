import { describe, expect, it } from 'vitest';
import { ReferenceDatasetBuilder } from '../../../../src/features/score-transaction/infrastructure/reference-dataset.js';
import {
  ReferenceIndexHolder,
  ReferenceIndexNotReadyError,
} from '../../../../src/features/score-transaction/infrastructure/reference-index-holder.js';

function datasetOf(size: number, version = 'v1') {
  const builder = new ReferenceDatasetBuilder();
  for (let i = 0; i < size; i++) builder.add(new Array(14).fill(i / 10), i % 2 ? 'fraud' : 'legit');
  return builder.build(version);
}

describe('ReferenceIndexHolder', () => {
  it('começa em loading e recusa buscas', () => {
    const holder = new ReferenceIndexHolder();

    expect(holder.status().state).toBe('loading');
    expect(holder.isReady()).toBe(false);
    expect(() => holder.findNearest(new Float32Array(14), 5)).toThrow(ReferenceIndexNotReadyError);
  });

  it('fica pronto após carregar e expõe quantidade e versão', async () => {
    const holder = new ReferenceIndexHolder();

    const status = await holder.load(async () => datasetOf(8, 'sha256:abc'));

    expect(status).toMatchObject({ state: 'ready', vectorCount: 8, version: 'sha256:abc', failureReason: null });
    expect(holder.isReady()).toBe(true);
    expect(holder.findNearest(new Float32Array(14), 5)).toHaveLength(5);
  });

  it('marca falha quando o carregamento lança erro', async () => {
    const holder = new ReferenceIndexHolder();

    const status = await holder.load(async () => {
      throw new Error('arquivo corrompido');
    });

    expect(status).toMatchObject({ state: 'failed', failureReason: 'arquivo corrompido' });
    expect(holder.isReady()).toBe(false);
  });

  it('recusa dataset com menos vetores que o k do KNN', async () => {
    const holder = new ReferenceIndexHolder();

    const status = await holder.load(async () => datasetOf(3));

    expect(status.state).toBe('failed');
    expect(status.failureReason).toMatch(/pelo menos 5/);
  });

  it('mantém o índice anterior se um recarregamento falhar', async () => {
    const holder = new ReferenceIndexHolder();
    await holder.load(async () => datasetOf(6, 'v1'));

    const status = await holder.load(async () => {
      throw new Error('falhou');
    });

    expect(status).toMatchObject({ state: 'ready', version: 'v1', failureReason: 'falhou' });
    expect(holder.isReady()).toBe(true);
  });

  it('usa a fábrica de índice informada, permitindo trocar a estratégia de busca', async () => {
    const created: number[] = [];
    const holder = new ReferenceIndexHolder((dataset) => {
      created.push(dataset.size);
      return { isReady: () => true, findNearest: () => [] };
    });

    await holder.load(async () => datasetOf(5));

    expect(created).toEqual([5]);
  });
});
