import { vectorize } from '../domain/feature-vector.js';
import { decide, type FraudDecision } from '../domain/fraud-decision.js';
import { NEIGHBOR_COUNT } from '../domain/scoring-rules.js';
import type { Clock } from './ports/clock.js';
import type { ConfigurationProvider } from './ports/configuration-provider.js';
import type { DecisionCache } from './ports/decision-cache.js';
import type { DecisionPublisher } from './ports/decision-publisher.js';
import type { ReferenceVectorIndex } from './ports/reference-vector-index.js';
import { parseScoreTransactionRequest, type InvalidField } from './score-transaction-request.js';

export type ScoreTransactionOutcome =
  | {
      readonly kind: 'scored';
      readonly decision: FraudDecision;
      /** true quando a decisão veio do cache de idempotência (RF17). */
      readonly replayed: boolean;
      readonly publishFailure: unknown;
    }
  | { readonly kind: 'invalid-request'; readonly invalidFields: InvalidField[] }
  | { readonly kind: 'index-unavailable' };

export interface ScoreTransactionUseCase {
  execute(rawRequest: unknown): Promise<ScoreTransactionOutcome>;
}

export interface ScoreTransactionDependencies {
  readonly vectorIndex: ReferenceVectorIndex;
  readonly decisionCache: DecisionCache;
  readonly publisher: DecisionPublisher;
  readonly configuration: ConfigurationProvider;
  readonly clock: Clock;
}

export class ScoreTransaction implements ScoreTransactionUseCase {
  constructor(private readonly deps: ScoreTransactionDependencies) {}

  async execute(rawRequest: unknown): Promise<ScoreTransactionOutcome> {
    const parsed = parseScoreTransactionRequest(rawRequest);
    if (!parsed.ok) {
      return { kind: 'invalid-request', invalidFields: parsed.invalidFields };
    }
    const { transaction } = parsed;

    const previous = this.deps.decisionCache.get(transaction.id);
    if (previous) {
      return { kind: 'scored', decision: previous, replayed: true, publishFailure: null };
    }

    if (!this.deps.vectorIndex.isReady()) {
      return { kind: 'index-unavailable' };
    }

    const parameters = this.deps.configuration.getScoringParameters();
    const featureVector = vectorize(transaction, parameters.normalization, parameters.mccRisk);
    const neighbors = this.deps.vectorIndex.findNearest(featureVector, NEIGHBOR_COUNT);
    const decision = decide({
      transactionId: transaction.id,
      featureVector,
      neighbors,
      approvalThreshold: parsed.approvalThreshold ?? parameters.approvalThreshold,
      decidedAt: this.deps.clock.now(),
    });

    // Gravado antes do primeiro await: um reenvio que chegue durante a
    // publicação já encontra a decisão e não gera um segundo cálculo.
    this.deps.decisionCache.set(transaction.id, decision);

    try {
      await this.deps.publisher.publish(decision, transaction);
      return { kind: 'scored', decision, replayed: false, publishFailure: null };
    } catch (error) {
      return { kind: 'scored', decision, replayed: false, publishFailure: error };
    }
  }
}
