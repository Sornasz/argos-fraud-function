import type { FeatureVector } from '../../domain/feature-vector.js';
import type { Neighbor } from '../../domain/neighbor.js';

export interface ReferenceVectorIndex {
  isReady(): boolean;
  /** Vizinhos ordenados do mais próximo para o mais distante. */
  findNearest(query: FeatureVector, k: number): Neighbor[];
}
