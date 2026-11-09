import { describe, expect, it } from 'vitest';
import { assessReadiness, type IndexSnapshot } from '../../../../src/features/health-check/domain/readiness.js';

function snapshot(overrides: Partial<IndexSnapshot>): IndexSnapshot {
  return {
    state: 'loading',
    vectorCount: 0,
    version: null,
    loadedAt: null,
    loadDurationMs: null,
    failureReason: null,
    ...overrides,
  };
}

describe('assessReadiness', () => {
  it('fica pronto com índice carregado e não vazio', () => {
    expect(assessReadiness(snapshot({ state: 'ready', vectorCount: 10 }))).toMatchObject({ ready: true, status: 'ready' });
  });

  it('informa starting enquanto o índice carrega', () => {
    expect(assessReadiness(snapshot({ state: 'loading' }))).toMatchObject({ ready: false, status: 'starting' });
  });

  it('informa unavailable quando o carregamento falhou', () => {
    expect(assessReadiness(snapshot({ state: 'failed', failureReason: 'x' }))).toMatchObject({
      ready: false,
      status: 'unavailable',
    });
  });

  it('não considera pronto um índice vazio', () => {
    expect(assessReadiness(snapshot({ state: 'ready', vectorCount: 0 })).ready).toBe(false);
  });
});
