import type { FeatureVector } from './feature-vector.js';
import type { Neighbor } from './neighbor.js';
import { NEIGHBOR_COUNT, assertApprovalThreshold } from './scoring-rules.js';

export interface FraudDecision {
  readonly transactionId: string;
  readonly fraudScore: number;
  readonly approved: boolean;
  readonly approvalThreshold: number;
  readonly featureVector: FeatureVector;
  readonly neighbors: readonly Neighbor[];
  readonly decidedAt: Date;
}

export class InsufficientNeighborsError extends Error {
  constructor(received: number) {
    super(`O cálculo do fraud_score exige ${NEIGHBOR_COUNT} vizinhos, recebeu ${received}.`);
    this.name = 'InsufficientNeighborsError';
  }
}

export function computeFraudScore(neighbors: readonly Neighbor[]): number {
  if (neighbors.length !== NEIGHBOR_COUNT) {
    throw new InsufficientNeighborsError(neighbors.length);
  }
  const frauds = neighbors.filter((neighbor) => neighbor.label === 'fraud').length;
  return frauds / NEIGHBOR_COUNT;
}

export function isApproved(fraudScore: number, approvalThreshold: number): boolean {
  return fraudScore < assertApprovalThreshold(approvalThreshold);
}

export interface DecideInput {
  readonly transactionId: string;
  readonly featureVector: FeatureVector;
  readonly neighbors: readonly Neighbor[];
  readonly approvalThreshold: number;
  readonly decidedAt: Date;
}

export function decide(input: DecideInput): FraudDecision {
  const fraudScore = computeFraudScore(input.neighbors);
  return {
    transactionId: input.transactionId,
    fraudScore,
    approved: isApproved(fraudScore, input.approvalThreshold),
    approvalThreshold: input.approvalThreshold,
    featureVector: input.featureVector,
    neighbors: input.neighbors,
    decidedAt: input.decidedAt,
  };
}
