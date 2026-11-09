import type { ReferenceIndexStatus } from '../../score-transaction/index.js';
import type { IndexStatusReader } from '../application/ports/index-status-reader.js';
import type { IndexSnapshot } from '../domain/readiness.js';

export class ReferenceIndexStatusReader implements IndexStatusReader {
  constructor(private readonly source: () => ReferenceIndexStatus) {}

  read(): IndexSnapshot {
    const status = this.source();
    return {
      state: status.state,
      vectorCount: status.vectorCount,
      version: status.version,
      loadedAt: status.loadedAt,
      loadDurationMs: status.loadDurationMs,
      failureReason: status.failureReason,
    };
  }
}
