import { app, type HttpResponseInit } from '@azure/functions';
import type { CheckReadinessUseCase } from '../application/check-readiness.use-case.js';

export function createReadyHandler(checkReadiness: CheckReadinessUseCase) {
  return async (): Promise<HttpResponseInit> => {
    const report = checkReadiness.execute();
    return {
      status: report.ready ? 200 : 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      jsonBody: {
        status: report.status,
        index: {
          state: report.index.state,
          vector_count: report.index.vectorCount,
          version: report.index.version,
          loaded_at: report.index.loadedAt?.toISOString() ?? null,
          load_duration_ms: report.index.loadDurationMs,
          failure_reason: report.index.failureReason,
        },
      },
    };
  };
}

export function registerReadyFunction(checkReadiness: CheckReadinessUseCase): void {
  app.http('ready', {
    methods: ['GET'],
    route: 'ready',
    authLevel: 'anonymous',
    handler: createReadyHandler(checkReadiness),
  });
}
