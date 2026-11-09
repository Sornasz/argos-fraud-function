export interface NormalizationConstants {
  readonly maxAmount: number;
  readonly maxInstallments: number;
  readonly amountVsAvgRatio: number;
  readonly maxMinutes: number;
  readonly maxKm: number;
  readonly maxTxCount24h: number;
  readonly maxMerchantAvgAmount: number;
}

export type MccRiskTable = Readonly<Record<string, number>>;

export interface ScoringParameters {
  readonly normalization: NormalizationConstants;
  readonly mccRisk: MccRiskTable;
  readonly approvalThreshold: number;
}

export const NEIGHBOR_COUNT = 5;
export const DEFAULT_APPROVAL_THRESHOLD = 0.6;
export const DEFAULT_MCC_RISK = 0.5;

export class InvalidApprovalThresholdError extends Error {
  constructor(value: number) {
    super(`Threshold de aprovação inválido: ${value}. Deve estar no intervalo (0, 1].`);
    this.name = 'InvalidApprovalThresholdError';
  }
}

export function isValidApprovalThreshold(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}

export function assertApprovalThreshold(value: number): number {
  if (!isValidApprovalThreshold(value)) {
    throw new InvalidApprovalThresholdError(value);
  }
  return value;
}
