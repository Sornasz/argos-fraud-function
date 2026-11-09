import type { ReferenceVectorIndex } from '../application/ports/reference-vector-index.js';
import { squaredEuclideanDistance } from '../domain/distance.js';
import { FEATURE_VECTOR_DIMENSIONS, type FeatureVector } from '../domain/feature-vector.js';
import type { Neighbor } from '../domain/neighbor.js';
import { codeToLabel, type ReferenceDataset } from './reference-dataset.js';

/**
 * KNN exato por força bruta: compara a consulta com todos os vetores e mantém
 * os k melhores num buffer ordenado por inserção. Para k = 5 isso é mais barato
 * que um heap. Em empate de distância vence o vetor que aparece primeiro no
 * dataset, o que deixa o resultado determinístico.
 */
export class BruteForceVectorIndex implements ReferenceVectorIndex {
  constructor(private readonly dataset: ReferenceDataset) {}

  isReady(): boolean {
    return true;
  }

  findNearest(query: FeatureVector, k: number): Neighbor[] {
    const limit = Math.min(k, this.dataset.size);
    if (limit <= 0) return [];

    const bestDistances = new Float64Array(limit).fill(Number.POSITIVE_INFINITY);
    const bestIds = new Int32Array(limit).fill(-1);
    const { vectors, size } = this.dataset;
    const last = limit - 1;

    for (let id = 0, offset = 0; id < size; id++, offset += FEATURE_VECTOR_DIMENSIONS) {
      const distance = squaredEuclideanDistance(query, vectors, offset);
      if (distance >= bestDistances[last]!) continue;

      let slot = last;
      while (slot > 0 && bestDistances[slot - 1]! > distance) {
        bestDistances[slot] = bestDistances[slot - 1]!;
        bestIds[slot] = bestIds[slot - 1]!;
        slot--;
      }
      bestDistances[slot] = distance;
      bestIds[slot] = id;
    }

    const neighbors: Neighbor[] = [];
    for (let slot = 0; slot < limit; slot++) {
      const referenceId = bestIds[slot]!;
      neighbors.push({
        referenceId,
        distance: Math.sqrt(bestDistances[slot]!),
        label: codeToLabel(this.dataset.labels[referenceId]!),
      });
    }
    return neighbors;
  }
}
