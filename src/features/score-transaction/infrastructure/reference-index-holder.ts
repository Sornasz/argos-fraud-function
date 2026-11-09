import type { ReferenceVectorIndex } from '../application/ports/reference-vector-index.js';
import type { FeatureVector } from '../domain/feature-vector.js';
import type { Neighbor } from '../domain/neighbor.js';
import { NEIGHBOR_COUNT } from '../domain/scoring-rules.js';
import { BruteForceVectorIndex } from './brute-force-vector-index.js';
import type { ReferenceDataset } from './reference-dataset.js';

export type ReferenceIndexState = 'loading' | 'ready' | 'failed';

export interface ReferenceIndexStatus {
  readonly state: ReferenceIndexState;
  readonly vectorCount: number;
  readonly version: string | null;
  readonly loadedAt: Date | null;
  readonly loadDurationMs: number | null;
  readonly failureReason: string | null;
}

export type IndexFactory = (dataset: ReferenceDataset) => ReferenceVectorIndex;

export const bruteForceIndexFactory: IndexFactory = (dataset) => new BruteForceVectorIndex(dataset);

export class ReferenceIndexNotReadyError extends Error {
  constructor() {
    super('O índice vetorial de referência ainda não foi carregado.');
    this.name = 'ReferenceIndexNotReadyError';
  }
}

/**
 * Mantém o índice vetorial do processo e o estado do carregamento. A troca da
 * estratégia de busca (força bruta hoje, HNSW depois) acontece só na
 * `IndexFactory`; o resto do serviço enxerga apenas a porta `ReferenceVectorIndex`.
 */
export class ReferenceIndexHolder implements ReferenceVectorIndex {
  private index: ReferenceVectorIndex | null = null;
  private currentStatus: ReferenceIndexStatus = {
    state: 'loading',
    vectorCount: 0,
    version: null,
    loadedAt: null,
    loadDurationMs: null,
    failureReason: null,
  };

  constructor(
    private readonly createIndex: IndexFactory = bruteForceIndexFactory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async load(loadDataset: () => Promise<ReferenceDataset>): Promise<ReferenceIndexStatus> {
    const startedAt = this.now();
    this.currentStatus = { ...this.currentStatus, state: 'loading', failureReason: null };
    try {
      const dataset = await loadDataset();
      if (dataset.size < NEIGHBOR_COUNT) {
        throw new Error(`Dataset com ${dataset.size} vetores; o KNN precisa de pelo menos ${NEIGHBOR_COUNT}.`);
      }
      this.index = this.createIndex(dataset);
      const loadedAt = this.now();
      this.currentStatus = {
        state: 'ready',
        vectorCount: dataset.size,
        version: dataset.version,
        loadedAt,
        loadDurationMs: loadedAt.getTime() - startedAt.getTime(),
        failureReason: null,
      };
    } catch (error) {
      this.currentStatus = {
        ...this.currentStatus,
        state: this.index ? 'ready' : 'failed',
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }
    return this.currentStatus;
  }

  status(): ReferenceIndexStatus {
    return this.currentStatus;
  }

  isReady(): boolean {
    return this.index !== null && this.index.isReady();
  }

  findNearest(query: FeatureVector, k: number): Neighbor[] {
    if (!this.index) throw new ReferenceIndexNotReadyError();
    return this.index.findNearest(query, k);
  }
}
