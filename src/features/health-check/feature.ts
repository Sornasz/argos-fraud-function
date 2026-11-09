import type { ReferenceIndexStatus } from '../score-transaction/index.js';
import { CheckReadiness } from './application/check-readiness.use-case.js';
import { ReferenceIndexStatusReader } from './infrastructure/reference-index-status-reader.js';
import { registerReadyFunction } from './api/ready.function.js';

export interface HealthCheckFeatureOptions {
  readonly referenceIndexStatus: () => ReferenceIndexStatus;
}

export interface HealthCheckFeature {
  readonly checkReadiness: CheckReadiness;
  registerFunctions(): void;
}

export function createHealthCheckFeature(options: HealthCheckFeatureOptions): HealthCheckFeature {
  const checkReadiness = new CheckReadiness(new ReferenceIndexStatusReader(options.referenceIndexStatus));
  return {
    checkReadiness,
    registerFunctions: () => registerReadyFunction(checkReadiness),
  };
}
