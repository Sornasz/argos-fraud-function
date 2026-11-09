import { describe, expect, it } from 'vitest';
import { BruteForceVectorIndex } from '../../../../src/features/score-transaction/infrastructure/brute-force-vector-index.js';
import { ReferenceDatasetBuilder } from '../../../../src/features/score-transaction/infrastructure/reference-dataset.js';
import type { ReferenceLabel } from '../../../../src/features/score-transaction/domain/neighbor.js';

function vectorWith(first: number, fill = 0): number[] {
  const vector = new Array<number>(14).fill(fill);
  vector[0] = first;
  return vector;
}

function indexOf(entries: Array<[number[], ReferenceLabel]>) {
  const builder = new ReferenceDatasetBuilder(2);
  for (const [vector, label] of entries) builder.add(vector, label);
  return new BruteForceVectorIndex(builder.build('test'));
}

describe('BruteForceVectorIndex', () => {
  it('retorna os k mais próximos em ordem crescente de distância', () => {
    const index = indexOf([
      [vectorWith(0.9), 'legit'],
      [vectorWith(0.1), 'fraud'],
      [vectorWith(0.5), 'legit'],
      [vectorWith(0.2), 'legit'],
      [vectorWith(0.0), 'fraud'],
      [vectorWith(0.7), 'fraud'],
    ]);

    const neighbors = index.findNearest(new Float32Array(vectorWith(0.12)), 3);

    expect(neighbors.map((n) => n.referenceId)).toEqual([1, 3, 4]);
    expect(neighbors.map((n) => n.label)).toEqual(['fraud', 'legit', 'fraud']);
    expect(neighbors[0]!.distance).toBeCloseTo(0.02, 6);
  });

  it('desempata pela posição no dataset', () => {
    const index = indexOf([
      [vectorWith(0.3), 'legit'],
      [vectorWith(0.1), 'fraud'],
      [vectorWith(0.1), 'legit'],
    ]);

    expect(index.findNearest(new Float32Array(vectorWith(0.1)), 2).map((n) => n.referenceId)).toEqual([1, 2]);
  });

  it('compara o sentinela -1 como valor, sem filtrar', () => {
    const index = indexOf([
      [vectorWith(0.5, 0), 'legit'],
      [vectorWith(0.5, -1), 'fraud'],
    ]);

    const [nearest] = index.findNearest(new Float32Array(vectorWith(0.5, -1)), 1);

    expect(nearest).toEqual({ referenceId: 1, distance: 0, label: 'fraud' });
  });

  it('devolve no máximo a quantidade de vetores existentes', () => {
    const index = indexOf([[vectorWith(0.1), 'legit']]);

    expect(index.findNearest(new Float32Array(vectorWith(0)), 5)).toHaveLength(1);
  });
});
