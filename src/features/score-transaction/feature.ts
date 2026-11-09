import type { DecisionPublisher } from './application/ports/decision-publisher.js';
import { ScoreTransaction } from './application/score-transaction.use-case.js';
import { EnvironmentConfigurationProvider } from './infrastructure/environment-configuration-provider.js';
import { InMemoryDecisionCache, type InMemoryDecisionCacheOptions } from './infrastructure/in-memory-decision-cache.js';
import { InMemoryDecisionPublisher } from './infrastructure/in-memory-decision-publisher.js';
import { loadReferenceDataset } from './infrastructure/reference-dataset-loader.js';
import { ReferenceIndexHolder, type ReferenceIndexStatus } from './infrastructure/reference-index-holder.js';
import { loadScoringRules } from './infrastructure/scoring-rules-files.js';
import {
  ServiceBusDecisionPublisher,
  type ServiceBusPublisherOptions,
} from './infrastructure/service-bus-decision-publisher.js';
import { systemClock } from './infrastructure/system-clock.js';
import { registerFraudScoreFunction } from './api/fraud-score.function.js';

export interface ScoreTransactionFeatureOptions {
  readonly datasetPath: string;
  readonly normalizationPath: string;
  readonly mccRiskPath: string;
  readonly idempotency: InMemoryDecisionCacheOptions;
  readonly serviceBus: ServiceBusPublisherOptions | null;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface ScoreTransactionFeature {
  readonly scoreTransaction: ScoreTransaction;
  referenceIndexStatus(): ReferenceIndexStatus;
  loadReferenceIndex(): Promise<ReferenceIndexStatus>;
  registerFunctions(): void;
}

export function createScoreTransactionFeature(options: ScoreTransactionFeatureOptions): ScoreTransactionFeature {
  const referenceIndex = new ReferenceIndexHolder();
  const indexVersion = () => referenceIndex.status().version;

  const publisher: DecisionPublisher = options.serviceBus
    ? ServiceBusDecisionPublisher.create(options.serviceBus, indexVersion)
    : new InMemoryDecisionPublisher(indexVersion);

  const scoreTransaction = new ScoreTransaction({
    vectorIndex: referenceIndex,
    decisionCache: new InMemoryDecisionCache(options.idempotency),
    publisher,
    configuration: new EnvironmentConfigurationProvider(loadScoringRules(options), options.env),
    clock: systemClock,
  });

  return {
    scoreTransaction,
    referenceIndexStatus: () => referenceIndex.status(),
    loadReferenceIndex: () => referenceIndex.load(() => loadReferenceDataset(options.datasetPath)),
    registerFunctions: () => registerFraudScoreFunction(scoreTransaction),
  };
}
