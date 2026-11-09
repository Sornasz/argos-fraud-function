import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EnvironmentConfigurationProvider,
  parseApprovalThreshold,
} from '../../../../src/features/score-transaction/infrastructure/environment-configuration-provider.js';
import {
  loadScoringRules,
  parseMccRiskTable,
  parseNormalizationConstants,
} from '../../../../src/features/score-transaction/infrastructure/scoring-rules-files.js';
import { normalization } from '../../../support/builders.js';

const resource = (name: string) => fileURLToPath(new URL(`../../../../resources/${name}`, import.meta.url));

describe('loadScoringRules', () => {
  it('lê as constantes e a tabela de MCC empacotadas no serviço', () => {
    const rules = loadScoringRules({
      normalizationPath: resource('normalization.json'),
      mccRiskPath: resource('mcc_risk.json'),
    });

    expect(rules.normalization).toEqual(normalization);
    expect(rules.mccRisk['5411']).toBe(0.15);
    expect(rules.mccRisk['7995']).toBe(0.85);
  });

  it('rejeita constante ausente ou não positiva', () => {
    expect(() => parseNormalizationConstants({ max_amount: 0 }, 'n.json')).toThrow(/max_amount/);
  });

  it('rejeita risco de MCC fora de [0, 1]', () => {
    expect(() => parseMccRiskTable({ '5411': 1.5 }, 'm.json')).toThrow(/5411/);
  });
});

describe('EnvironmentConfigurationProvider', () => {
  const rules = { normalization, mccRisk: {} };

  it('usa 0.6 quando FRAUD_APPROVAL_THRESHOLD não está definido', () => {
    expect(new EnvironmentConfigurationProvider(rules, {}).getScoringParameters().approvalThreshold).toBe(0.6);
  });

  it('relê o threshold a cada chamada', () => {
    const env: Record<string, string> = { FRAUD_APPROVAL_THRESHOLD: '0.6' };
    const provider = new EnvironmentConfigurationProvider(rules, env);
    expect(provider.getScoringParameters().approvalThreshold).toBe(0.6);

    env.FRAUD_APPROVAL_THRESHOLD = '0.8';

    expect(provider.getScoringParameters().approvalThreshold).toBe(0.8);
  });

  it('rejeita threshold inválido', () => {
    expect(() => parseApprovalThreshold('abc')).toThrow();
    expect(() => parseApprovalThreshold('1.5')).toThrow();
  });
});
