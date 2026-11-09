import type { ConfigurationProvider } from '../application/ports/configuration-provider.js';
import {
  DEFAULT_APPROVAL_THRESHOLD,
  assertApprovalThreshold,
  type ScoringParameters,
} from '../domain/scoring-rules.js';
import type { ScoringRules } from './scoring-rules-files.js';

export const APPROVAL_THRESHOLD_VARIABLE = 'FRAUD_APPROVAL_THRESHOLD';

export function parseApprovalThreshold(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_APPROVAL_THRESHOLD;
  return assertApprovalThreshold(Number(raw));
}

/**
 * O threshold é lido do ambiente a cada chamada (RF09). No Azure Functions
 * ele vem de uma App Setting, que pode ser alterada sem publicar código novo.
 */
export class EnvironmentConfigurationProvider implements ConfigurationProvider {
  constructor(
    private readonly rules: ScoringRules,
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  getScoringParameters(): ScoringParameters {
    return {
      normalization: this.rules.normalization,
      mccRisk: this.rules.mccRisk,
      approvalThreshold: parseApprovalThreshold(this.env[APPROVAL_THRESHOLD_VARIABLE]),
    };
  }
}
