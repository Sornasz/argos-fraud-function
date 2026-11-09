import type { Clock } from '../../src/features/score-transaction/application/ports/clock.js';
import type { ConfigurationProvider } from '../../src/features/score-transaction/application/ports/configuration-provider.js';
import type { DecisionCache } from '../../src/features/score-transaction/application/ports/decision-cache.js';
import type { DecisionPublisher } from '../../src/features/score-transaction/application/ports/decision-publisher.js';
import type { ReferenceVectorIndex } from '../../src/features/score-transaction/application/ports/reference-vector-index.js';
import { squaredEuclideanDistance } from '../../src/features/score-transaction/domain/distance.js';
import type { FeatureVector } from '../../src/features/score-transaction/domain/feature-vector.js';
import type { FraudDecision } from '../../src/features/score-transaction/domain/fraud-decision.js';
import type { Neighbor, ReferenceLabel } from '../../src/features/score-transaction/domain/neighbor.js';
import type { ScoringParameters } from '../../src/features/score-transaction/domain/scoring-rules.js';
import type { Transaction } from '../../src/features/score-transaction/domain/transaction.js';
import { mccRisk, normalization } from './builders.js';

export interface LabeledVector {
  readonly vector: readonly number[];
  readonly label: ReferenceLabel;
}

/** Índice em memória sobre uma lista pequena de vetores escritos à mão. */
export class FakeVectorIndex implements ReferenceVectorIndex {
  readonly queries: FeatureVector[] = [];
  ready = true;

  constructor(private readonly references: readonly LabeledVector[]) {}

  isReady(): boolean {
    return this.ready;
  }

  findNearest(query: FeatureVector, k: number): Neighbor[] {
    this.queries.push(query);
    return this.references
      .map((reference, referenceId) => ({
        referenceId,
        distance: Math.sqrt(squaredEuclideanDistance(query, reference.vector)),
        label: reference.label,
      }))
      .sort((a, b) => a.distance - b.distance || a.referenceId - b.referenceId)
      .slice(0, k);
  }
}

export class MapDecisionCache implements DecisionCache {
  readonly entries = new Map<string, FraudDecision>();

  get(transactionId: string): FraudDecision | undefined {
    return this.entries.get(transactionId);
  }

  set(transactionId: string, decision: FraudDecision): void {
    this.entries.set(transactionId, decision);
  }
}

export class RecordingPublisher implements DecisionPublisher {
  readonly published: Array<{ decision: FraudDecision; transaction: Transaction }> = [];
  failWith: Error | null = null;

  async publish(decision: FraudDecision, transaction: Transaction): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.published.push({ decision, transaction });
  }
}

export class FixedConfiguration implements ConfigurationProvider {
  constructor(public approvalThreshold = 0.6) {}

  getScoringParameters(): ScoringParameters {
    return { normalization, mccRisk, approvalThreshold: this.approvalThreshold };
  }
}

export class FixedClock implements Clock {
  constructor(private readonly instant = new Date('2026-10-05T12:00:01Z')) {}

  now(): Date {
    return this.instant;
  }
}
