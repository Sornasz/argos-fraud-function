import { describe, expect, it } from 'vitest';
import { CheckReadiness } from '../../../../src/features/health-check/application/check-readiness.use-case.js';
import type { IndexStatusReader } from '../../../../src/features/health-check/application/ports/index-status-reader.js';
import type { IndexSnapshot } from '../../../../src/features/health-check/domain/readiness.js';

class FakeIndexStatusReader implements IndexStatusReader {
  constructor(public snapshot: IndexSnapshot) {}

  read(): IndexSnapshot {
    return this.snapshot;
  }
}

describe('CheckReadiness', () => {
  it('reflete o estado atual do índice a cada execução', () => {
    const reader = new FakeIndexStatusReader({
      state: 'loading',
      vectorCount: 0,
      version: null,
      loadedAt: null,
      loadDurationMs: null,
      failureReason: null,
    });
    const checkReadiness = new CheckReadiness(reader);

    expect(checkReadiness.execute().ready).toBe(false);

    reader.snapshot = { ...reader.snapshot, state: 'ready', vectorCount: 1_000_000, version: 'sha256:abc' };
    const report = checkReadiness.execute();

    expect(report.ready).toBe(true);
    expect(report.index).toMatchObject({ vectorCount: 1_000_000, version: 'sha256:abc' });
  });
});
