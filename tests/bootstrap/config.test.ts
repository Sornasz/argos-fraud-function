import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ServiceConfigError, readServiceConfig } from '../../src/bootstrap/config.js';

describe('readServiceConfig', () => {
  it('exige DATASET_PATH', () => {
    expect(() => readServiceConfig({})).toThrow(ServiceConfigError);
    expect(() => readServiceConfig({})).toThrow(/DATASET_PATH/);
  });

  it('usa os padrões e os arquivos de regras empacotados', () => {
    const config = readServiceConfig({ DATASET_PATH: '/data/references.json.gz' });

    expect(config.datasetPath).toBe('/data/references.json.gz');
    expect(existsSync(config.normalizationPath)).toBe(true);
    expect(existsSync(config.mccRiskPath)).toBe(true);
    expect(config.idempotency).toEqual({ ttlMs: 900_000, maxEntries: 100_000 });
    expect(config.serviceBus).toBeNull();
  });

  it('ativa o Service Bus quando há connection string', () => {
    const config = readServiceConfig({
      DATASET_PATH: '/data/references.json.gz',
      SERVICEBUS_CONNECTION_STRING: 'Endpoint=sb://exemplo/',
    });

    expect(config.serviceBus).toEqual({ connectionString: 'Endpoint=sb://exemplo/', topicName: 'transaction-scored' });
  });

  it('reúne todos os problemas numa única mensagem', () => {
    try {
      readServiceConfig({ FRAUD_APPROVAL_THRESHOLD: '2', IDEMPOTENCY_TTL_SECONDS: '-5' });
      expect.unreachable();
    } catch (error) {
      expect((error as ServiceConfigError).problems).toHaveLength(3);
    }
  });
});
