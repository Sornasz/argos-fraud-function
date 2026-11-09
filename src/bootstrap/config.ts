import { fileURLToPath } from 'node:url';
import { parseApprovalThreshold } from '../features/score-transaction/index.js';

export interface ServiceConfig {
  readonly datasetPath: string;
  readonly normalizationPath: string;
  readonly mccRiskPath: string;
  readonly idempotency: { readonly ttlMs: number; readonly maxEntries: number };
  readonly serviceBus: { readonly connectionString: string; readonly topicName: string } | null;
}

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_TOPIC = 'transaction-scored';
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 900;
const DEFAULT_IDEMPOTENCY_MAX_ENTRIES = 100_000;

export class ServiceConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuração inválida do fraud-scoring-service:\n- ${problems.join('\n- ')}`);
    this.name = 'ServiceConfigError';
  }
}

// src/bootstrap e dist/bootstrap ficam no mesmo nível, então o caminho vale nos dois casos.
function bundledResource(fileName: string): string {
  return fileURLToPath(new URL(`../../resources/${fileName}`, import.meta.url));
}

function positiveInteger(env: Env, name: string, fallback: number, problems: string[]): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    problems.push(`${name} deve ser um inteiro positivo (recebido "${raw}").`);
    return fallback;
  }
  return value;
}

export function readServiceConfig(env: Env): ServiceConfig {
  const problems: string[] = [];

  const datasetPath = env.DATASET_PATH?.trim();
  if (!datasetPath) problems.push('DATASET_PATH é obrigatório e deve apontar para references.json(.gz).');

  try {
    parseApprovalThreshold(env.FRAUD_APPROVAL_THRESHOLD);
  } catch (error) {
    problems.push((error as Error).message);
  }

  const ttlSeconds = positiveInteger(env, 'IDEMPOTENCY_TTL_SECONDS', DEFAULT_IDEMPOTENCY_TTL_SECONDS, problems);
  const maxEntries = positiveInteger(env, 'IDEMPOTENCY_MAX_ENTRIES', DEFAULT_IDEMPOTENCY_MAX_ENTRIES, problems);

  if (problems.length > 0) throw new ServiceConfigError(problems);

  const connectionString = env.SERVICEBUS_CONNECTION_STRING?.trim();
  return {
    datasetPath: datasetPath!,
    normalizationPath: env.NORMALIZATION_PATH?.trim() || bundledResource('normalization.json'),
    mccRiskPath: env.MCC_RISK_PATH?.trim() || bundledResource('mcc_risk.json'),
    idempotency: { ttlMs: ttlSeconds * 1000, maxEntries },
    serviceBus: connectionString
      ? { connectionString, topicName: env.SERVICEBUS_TOPIC_NAME?.trim() || DEFAULT_TOPIC }
      : null,
  };
}
