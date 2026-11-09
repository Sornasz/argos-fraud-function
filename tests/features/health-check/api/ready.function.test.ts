import { describe, expect, it } from 'vitest';
import type { CheckReadinessUseCase } from '../../../../src/features/health-check/application/check-readiness.use-case.js';
import type { ReadinessReport } from '../../../../src/features/health-check/domain/readiness.js';
import { createReadyHandler } from '../../../../src/features/health-check/api/ready.function.js';

function useCaseReturning(report: ReadinessReport): CheckReadinessUseCase {
  return { execute: () => report };
}

const index = {
  state: 'ready' as const,
  vectorCount: 1_000_000,
  version: 'sha256:abc',
  loadedAt: new Date('2026-10-05T12:00:00Z'),
  loadDurationMs: 4_200,
  failureReason: null,
};

describe('GET /ready', () => {
  it('responde 200 com quantidade de vetores e versão do índice', async () => {
    const response = await createReadyHandler(useCaseReturning({ status: 'ready', ready: true, index }))();

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({
      status: 'ready',
      index: {
        state: 'ready',
        vector_count: 1_000_000,
        version: 'sha256:abc',
        loaded_at: '2026-10-05T12:00:00.000Z',
        load_duration_ms: 4_200,
        failure_reason: null,
      },
    });
  });

  it('responde 503 enquanto não está pronto', async () => {
    const report: ReadinessReport = {
      status: 'starting',
      ready: false,
      index: { ...index, state: 'loading', vectorCount: 0, loadedAt: null },
    };

    const response = await createReadyHandler(useCaseReturning(report))();

    expect(response.status).toBe(503);
  });
});
