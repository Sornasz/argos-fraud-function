import type { ScoringParameters } from '../../domain/scoring-rules.js';

export interface ConfigurationProvider {
  getScoringParameters(): ScoringParameters;
}
