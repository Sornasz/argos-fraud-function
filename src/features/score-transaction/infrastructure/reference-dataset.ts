import { FEATURE_VECTOR_DIMENSIONS } from '../domain/feature-vector.js';
import type { ReferenceLabel } from '../domain/neighbor.js';

/**
 * Dataset de referência em layout plano: o vetor `i` ocupa
 * `vectors[i * 14 .. i * 14 + 13]` e o rótulo dele fica em `labels[i]`
 * (1 = fraude, 0 = legítima). Evita um objeto por registro, que em 1 milhão de
 * registros custaria centenas de MB de heap.
 */
export interface ReferenceDataset {
  readonly vectors: Float32Array;
  readonly labels: Uint8Array;
  readonly size: number;
  readonly version: string;
}

export const FRAUD_LABEL = 1;
export const LEGIT_LABEL = 0;

export function labelToCode(label: string): number | undefined {
  if (label === 'fraud') return FRAUD_LABEL;
  if (label === 'legit') return LEGIT_LABEL;
  return undefined;
}

export function codeToLabel(code: number): ReferenceLabel {
  return code === FRAUD_LABEL ? 'fraud' : 'legit';
}

export class ReferenceDatasetBuilder {
  private vectors: Float32Array;
  private labels: Uint8Array;
  private count = 0;

  constructor(initialCapacity = 65_536) {
    this.vectors = new Float32Array(initialCapacity * FEATURE_VECTOR_DIMENSIONS);
    this.labels = new Uint8Array(initialCapacity);
  }

  get size(): number {
    return this.count;
  }

  add(vector: ArrayLike<number>, label: ReferenceLabel): void {
    if (vector.length !== FEATURE_VECTOR_DIMENSIONS) {
      throw new Error(`Vetor com ${vector.length} dimensões; esperado ${FEATURE_VECTOR_DIMENSIONS}.`);
    }
    if (this.count === this.labels.length) this.grow();
    this.vectors.set(vector, this.count * FEATURE_VECTOR_DIMENSIONS);
    this.labels[this.count] = label === 'fraud' ? FRAUD_LABEL : LEGIT_LABEL;
    this.count++;
  }

  build(version: string): ReferenceDataset {
    return {
      vectors: this.vectors.slice(0, this.count * FEATURE_VECTOR_DIMENSIONS),
      labels: this.labels.slice(0, this.count),
      size: this.count,
      version,
    };
  }

  private grow(): void {
    const capacity = this.labels.length * 2;
    const vectors = new Float32Array(capacity * FEATURE_VECTOR_DIMENSIONS);
    vectors.set(this.vectors);
    const labels = new Uint8Array(capacity);
    labels.set(this.labels);
    this.vectors = vectors;
    this.labels = labels;
  }
}
